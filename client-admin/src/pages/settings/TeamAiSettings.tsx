import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { TeamClient } from '../../../../shared/TeamCommunication'
import { aiSettingsCopy, aiSettingsError } from './aiSettingsCopy'
import { AdminDialog } from '../../components/AdminDialog'
import { readCheckTicket, writeCheckTicket, finishCheckTicket, type CheckIdentity, type CheckTicket } from './aiSettingsCheckJournal'

const button='rounded-lg border px-3 py-2 text-sm disabled:opacity-50'
const field='mt-1 w-full min-w-0 rounded-lg border bg-white p-2.5 text-sm'
type Region='global'|'cn'
interface Connection { status:'ready'|'failed'|'checking'|'unverified'|'uncertain'; configVersion:number; region:Region; model:string; checkedAt?:string; error?:string; requestId?:string; checkRevision?:number }
interface Settings {
 version:number; checkRevision:number; enabled:boolean; provider:'minimax'; model:string; region:Region; monthlyBudgetUsd:number|null
 inputPerMillionUsd:number; outputPerMillionUsd:number; maxOutputTokens?:number|null; keyConfigured:boolean; month:string; estimatedMonthUsd:number; connection?:Connection
}
const editable=(s:Settings)=>({enabled:s.enabled,provider:s.provider,model:s.model,region:s.region,monthlyBudgetUsd:s.monthlyBudgetUsd,inputPerMillionUsd:s.inputPerMillionUsd,outputPerMillionUsd:s.outputPerMillionUsd,maxOutputTokens:s.maxOutputTokens??null})
const errorCode=(e:any)=>e?.response?.data?.message||''

export function TeamAiSettings({client,identity,language,children}:{client:Pick<TeamClient,'request'|'current'>;identity:CheckIdentity;language:string;children?:ReactNode}) {
 const c=aiSettingsCopy(language),[base,setBase]=useState<Settings|null>(null),[draft,setDraft]=useState<Settings|null>(null)
 const [apiKey,setApiKey]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
 const [error,setError]=useState(''),[errorField,setErrorField]=useState(''),[advanced,setAdvanced]=useState(false),[removeOpen,setRemoveOpen]=useState(false)
 const [checking,setChecking]=useState(false),[checkConsent,setCheckConsent]=useState(false),[connection,setConnection]=useState<Connection|null>(null)
 const [pending,setPending]=useState<CheckTicket|null>(null),[journalBlocked,setJournalBlocked]=useState(false)
 const form=useRef<HTMLFormElement>(null),alive=useRef(true),epoch=useRef(0)
 const current=()=>alive.current&&client.current()
 const dirty=!!base&&!!draft&&(JSON.stringify(editable(base))!==JSON.stringify(editable(draft))||!!apiKey)
 const regionChanged=!!base&&!!draft&&base.region!==draft.region
 const domain=draft?.region==='cn'?'api.minimax.cn':'api.minimax.io'
 const regionName=(r:Region)=>r==='cn'?c.cn:c.global
 const validConnection=base&&connection?.configVersion===base.version&&connection.region===base.region&&connection.model===base.model?connection:null
 const connectionStatus=!dirty&&validConnection?.status||'unverified'
 const unknownConnection=(ticket:CheckTicket):Connection=>({requestId:ticket.requestId,configVersion:ticket.version,region:ticket.region,model:ticket.model,status:'uncertain',error:'TEAM_AI_PROVIDER_UNAVAILABLE'})
 const sameScope=(ticket:CheckTicket,value:Settings)=>ticket.userId===identity.userId&&ticket.storeId===identity.storeId&&ticket.version===value.version&&ticket.region===value.region&&ticket.model===value.model
 const linked=(result:Connection|undefined,ticket:CheckTicket)=>!!result&&result.requestId===ticket.requestId&&result.checkRevision===ticket.expectedCheckRevision+1&&result.configVersion===ticket.version&&result.region===ticket.region&&result.model===ticket.model
 function observe(value:Settings,fallback:CheckTicket|null=pending):Connection|null {
  try{
   const ticket=readCheckTicket(identity,value)||(fallback&&sameScope(fallback,value)?fallback:null);setJournalBlocked(false)
   if(!ticket){setPending(null);return value.connection||null}
   if(linked(value.connection,ticket)&&['ready','failed'].includes(value.connection!.status)){
    finishCheckTicket(ticket);const other=readCheckTicket(identity,value);setPending(other);return other?unknownConnection(other):value.connection!
   }
   setPending(ticket);return linked(value.connection,ticket)?value.connection!:unknownConnection(ticket)
  }catch{setJournalBlocked(true);setError(c.journalUnavailable);return {configVersion:value.version,region:value.region,model:value.model,status:'uncertain'}}
 }
 function install(value:Settings){const normalized={...value,region:value.region||'global' as Region};setBase(normalized);setDraft(normalized);setConnection(observe(normalized));setApiKey('');setConsent(false);setCheckConsent(false);setRemoveOpen(false)}
 async function load(){
  const request=++epoch.current;setLoading(true);setError('')
  try{const value=await client.request('get','/team/ai/settings');if(current()&&request===epoch.current)install(value)}
  catch{if(current()&&request===epoch.current)setError(c.loadError)}
  finally{if(current()&&request===epoch.current)setLoading(false)}
 }
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;epoch.current++}},[client])
 function change(patch:Partial<Settings>){if(draft){setDraft({...draft,...patch});setError('');setErrorField('');setCheckConsent(false)}}
 function fail(text:string,name:string){setRemoveOpen(false);setError(text);setErrorField(name);if(name==='rates'||name==='outputLimit')setAdvanced(true);requestAnimationFrame(()=>{const element=form.current?.querySelector<HTMLElement>(`[data-field="${name}"]`);element?.focus();element?.scrollIntoView({block:'center',behavior:'smooth'})})}
 async function save(remove=false){
  if(!draft||!base||busy||checking)return
  const next={...draft,enabled:remove?false:draft.enabled}
  if(!/^MiniMax-[A-Za-z0-9.-]+$/.test(next.model)||next.model.length>80){fail(c.modelInvalid,'model');return}
  if(!remove&&((regionChanged&&base.keyConfigured)||next.enabled&&!base.keyConfigured)&&!apiKey){fail(c.keyRequired,'key');return}
  if(!remove&&apiKey&&!/^[\x21-\x7e]{10,8192}$/.test(apiKey)){fail(c.keyInvalid,'key');return}
  if(!remove&&apiKey&&!consent){fail(c.consentRequired,'consent');return}
  if(next.maxOutputTokens!=null&&(!Number.isInteger(next.maxOutputTokens)||next.maxOutputTokens<1||next.maxOutputTokens>524288)){fail(c.outputLimitInvalid,'outputLimit');return}
  const rateValid=(value:number,max:number)=>Number.isFinite(value)&&value>0&&value<=max
  if(!rateValid(next.inputPerMillionUsd,1000)||!rateValid(next.outputPerMillionUsd,1000)){fail(c.ratesInvalid,'rates');return}
  if(next.monthlyBudgetUsd!==null&&!rateValid(next.monthlyBudgetUsd,100000)){fail(c.ratesInvalid,'budget');return}
  const request=++epoch.current;setBusy(true);setError('');setErrorField('')
  try{
   const value:Settings=await client.request('put','/team/ai/settings',{...editable(next),expectedVersion:base.version,targetConfirmed:consent,removeKey:remove,...(!remove&&apiKey?{apiKey}:{})})
   if(!current()||request!==epoch.current)return
   if(value.version!==base.version+1||value.region!==next.region||value.model!==next.model){setError(c.responseMismatch);return}
   install(value)
  }catch(e){if(current()&&request===epoch.current){const code=errorCode(e);if(code==='TEAM_AI_REGION_CONFIRM_REQUIRED')fail(c.consentRequired,'consent');else if(['TEAM_AI_REGION_KEY_REQUIRED','TEAM_AI_KEY_REQUIRED','TEAM_AI_CREDENTIAL_REGION_MISMATCH'].includes(code))fail(c.keyRequired,'key');else setError(code==='TEAM_VERSION_CONFLICT'?c.conflict:c.saveError)}}
  finally{if(current()&&request===epoch.current)setBusy(false)}
 }
 async function check(resume=false){
  if(!base||dirty||busy||checking||!checkConsent||journalBlocked)return
  const snapshot=base;let ticket:CheckTicket
  try{
   const existing=readCheckTicket(identity,snapshot)||(pending&&sameScope(pending,snapshot)?pending:null)
   if(resume&&!existing)return
   if(!Number.isSafeInteger(snapshot.checkRevision)||snapshot.checkRevision<0){setError(c.resultChanged);return}
   ticket=existing||{...identity,version:snapshot.version,region:snapshot.region,model:snapshot.model,requestId:crypto.randomUUID(),expectedCheckRevision:snapshot.checkRevision}
   writeCheckTicket(ticket);setPending(ticket)
  }catch{setJournalBlocked(true);setError(c.journalUnavailable);return}
  const request=++epoch.current;setChecking(true);setError('')
  try{
   const result:Connection=await client.request('post','/team/ai/connection-check',{expectedVersion:ticket.version,expectedCheckRevision:ticket.expectedCheckRevision,requestId:ticket.requestId,consent:true})
   if(!current()||request!==epoch.current)return
   if(!linked(result,ticket)){setConnection(unknownConnection(ticket));setError(c.resultChanged);return}
   const next={...snapshot,checkRevision:Math.max(snapshot.checkRevision,result.checkRevision!),connection:result};setBase(next);setConnection(observe(next,ticket))
  }catch(e){if(current()&&request===epoch.current){const code=errorCode(e);if(['TEAM_AI_COST_ESTIMATE_REQUIRED','TEAM_AI_BUDGET_STATE_INVALID','TEAM_AI_BUDGET_LIMIT'].includes(code)){try{finishCheckTicket(ticket);setPending(readCheckTicket(identity,snapshot))}catch{setJournalBlocked(true)}setConnection(snapshot.connection||null);setError(code==='TEAM_AI_BUDGET_LIMIT'?c.budgetBlocked:c.estimateRequired);return}if(['TEAM_AI_CHECK_CONFLICT','TEAM_VERSION_CONFLICT','TEAM_AI_CONFIG_CHANGED'].includes(code)){try{finishCheckTicket(ticket);setPending(readCheckTicket(identity,snapshot))}catch{setJournalBlocked(true)}setError(c.resultChanged)}else setError(c.outcomeUnknown);setConnection(unknownConnection(ticket))}}
  finally{if(current()&&request===epoch.current){setChecking(false);setCheckConsent(false)}}
 }
 async function refreshStatus(){
  if(!base||busy||checking)return
  const request=++epoch.current
  try{const value:Settings=await client.request('get','/team/ai/settings');if(!current()||request!==epoch.current)return;if(value.version!==base.version){setError(c.conflict);return}setError('');setBase(value);setConnection(observe(value))}catch{if(current()&&request===epoch.current)setError(c.loadError)}
 }
 const invalid=(name:string)=>errorField===name?true:undefined
 if(loading&&!draft)return <div role="status" className="rounded-xl border bg-white p-6">{c.loading}</div>
 if(!draft||!base)return <div className="rounded-xl border bg-white p-6"><p role="alert">{error}</p><button className={`${button} mt-3`} onClick={()=>void load()}>{c.reload}</button></div>
 return <form ref={form} noValidate onSubmit={event=>{event.preventDefault();void save()}} className="space-y-5" data-testid="team-ai-settings">
  <section className="rounded-xl border bg-white p-4 sm:p-6" aria-labelledby="ai-connection">
   <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="ai-connection" className="font-semibold">{c.connection}</h3><span role="status" data-testid="ai-save-state" className={`rounded-full px-3 py-1 text-xs ${dirty?'bg-amber-50 text-amber-800':'bg-gray-100 text-gray-700'}`}>{busy?c.saving:dirty?c.unsaved:base.version?c.saved:c.notSaved}</span></div>
   <p className="mt-2 text-xs text-gray-500" data-testid="ai-saved-region">{c.savedRegion}: {regionName(base.region)} · {c.version} {base.version} · {base.keyConfigured?c.keyStored:c.keyMissing}</p>
   <fieldset disabled={busy||checking} className="mt-4 space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><div><span className="text-sm">{c.provider}</span><p className="mt-1 rounded-lg bg-gray-50 p-2.5 text-sm">MiniMax</p></div>
     <label className="text-sm">{c.region}<select className={field} value={draft.region} data-testid="ai-region" onChange={e=>{const region=e.target.value as Region;change({region});setApiKey('');setConsent(false)}}><option value="global">{c.global}</option><option value="cn">{c.cn}</option></select></label>
     <label className="text-sm">{c.model}<input className={field} data-field="model" data-testid="ai-model" aria-invalid={invalid('model')} maxLength={80} value={draft.model} list="ai-supported-models" onChange={e=>change({model:e.target.value})}/><datalist id="ai-supported-models"><option value="MiniMax-M3"/></datalist></label>
     <label className="text-sm">{c.key}<input className={field} data-field="key" data-testid="ai-key" aria-invalid={invalid('key')} type="password" autoComplete="new-password" maxLength={8192} value={apiKey} placeholder={regionChanged||!base.keyConfigured?c.keyNew:c.keyKeep} onChange={e=>{setApiKey(e.target.value);setConsent(false);setError('');setErrorField('')}}/></label>
    </div>
    {regionChanged&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{c.keyRegion}</p>}
    {!!apiKey&&<label className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"><input className="mt-1 shrink-0" data-field="consent" data-testid="ai-destination-consent" aria-invalid={invalid('consent')} type="checkbox" checked={consent} onChange={e=>{setConsent(e.target.checked);setError('');setErrorField('')}}/><span>{c.destination} <strong className="break-all">{domain}</strong></span></label>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} data-testid="ai-enabled" onChange={e=>change({enabled:e.target.checked})}/>{c.enabled}</label>
   </fieldset>
  </section>
  {children}
  <section className="rounded-xl border bg-white p-4 sm:p-6" aria-labelledby="ai-running">
   <h3 id="ai-running" className="font-semibold">{c.running}</h3>
   <div className="mt-4 grid gap-4 sm:grid-cols-2">
    <div className="rounded-lg bg-gray-50 p-4"><p role="status" data-testid="ai-connection-state" className="text-sm font-semibold">{checking?c.checking:connectionStatus==='ready'?c.ready:connectionStatus==='failed'?c.failed:connectionStatus==='uncertain'?c.uncertain:connectionStatus==='checking'?c.checking:c.unverified}</p>
     <p className="mt-1 text-xs text-gray-600">{c.checkVersion} {base.version} · {regionName(base.region)} · {base.model}</p>
     {!base.enabled&&<p className="mt-2 text-xs text-gray-600">{c.paused}</p>}
     {!dirty&&validConnection?.error&&<p className="mt-2 text-sm text-red-700">{connectionStatus==='uncertain'?c.outcomeUnknown:aiSettingsError(language,validConnection.error)}</p>}
     {!dirty&&validConnection?.checkedAt&&<time className="mt-1 block text-xs text-gray-500">{new Date(validConnection.checkedAt).toLocaleString(language)}</time>}
     {dirty?<p className="mt-3 text-sm text-amber-800">{c.checkDirty}</p>:base.keyConfigured&&<label className="mt-3 flex items-start gap-2 text-xs text-gray-600"><input className="mt-0.5 shrink-0" type="checkbox" checked={checkConsent} disabled={busy||checking} data-testid="ai-check-consent" onChange={e=>setCheckConsent(e.target.checked)}/>{c.checkConsent}</label>}
     <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} disabled={busy||checking||dirty||journalBlocked||!!pending||!base.keyConfigured||!checkConsent||connectionStatus==='checking'||connectionStatus==='uncertain'} onClick={()=>void check()}>{c.check}</button>{pending&&<button type="button" className={button} disabled={busy||checking||dirty||journalBlocked||!base.keyConfigured||!checkConsent} onClick={()=>void check(true)}>{c.resume}</button>}<button type="button" className={button} disabled={busy||checking} onClick={()=>void refreshStatus()}>{c.refresh}</button></div>
    </div>
    <div className="rounded-lg bg-gray-50 p-4"><p className="text-sm font-medium">{c.cost}</p><p className="mt-2 text-xl font-semibold">${base.estimatedMonthUsd.toFixed(6)}</p><p className="mt-1 text-xs text-gray-500">{c.month}: {base.month}</p>
     <label className="mt-3 block text-sm">{c.budget}<input className={field} data-field="budget" aria-invalid={invalid('budget')} disabled={busy||checking} type="number" min="0.000001" max="100000" step="any" placeholder={c.noCap} value={draft.monthlyBudgetUsd??''} onChange={e=>change({monthlyBudgetUsd:e.target.value===''?null:Number(e.target.value)})}/></label>
     <p className="mt-3 text-xs leading-relaxed text-gray-500">{c.reservation}</p>
    </div>
   </div>
   <details open={advanced} onToggle={event=>setAdvanced(event.currentTarget.open)} className="mt-4 border-t pt-4"><summary className="cursor-pointer text-sm font-medium">{c.advanced}</summary><fieldset disabled={busy||checking} className="mt-3 grid gap-3 sm:grid-cols-2">
    <label className="text-sm">{c.input}<input className={field} data-field="rates" type="number" min="0.000001" max="1000" step="any" value={draft.inputPerMillionUsd} onChange={e=>change({inputPerMillionUsd:Number(e.target.value)})}/></label>
    <label className="text-sm">{c.output}<input className={field} type="number" min="0.000001" max="1000" step="any" value={draft.outputPerMillionUsd} onChange={e=>change({outputPerMillionUsd:Number(e.target.value)})}/></label>
    {(validConnection?.status==='ready'||base.maxOutputTokens!=null||draft.maxOutputTokens!=null)&&<label className="text-sm sm:col-span-2">{c.outputLimit}<input className={field} data-field="outputLimit" data-testid="ai-output-limit" aria-invalid={invalid('outputLimit')} type="number" min="1" max="524288" step="1" placeholder={c.outputLimitDefault} value={draft.maxOutputTokens??''} onChange={e=>change({maxOutputTokens:e.target.value===''?null:Number(e.target.value)})}/><span className="mt-1 block text-xs text-gray-500">{c.outputLimitNote}</span></label>}
   </fieldset><p className="mt-3 text-xs text-gray-500">{c.priceNote}</p></details>
   {base.keyConfigured&&<div className="mt-4 border-t pt-4"><button type="button" className="text-sm text-red-700 underline" disabled={busy||checking} onClick={()=>setRemoveOpen(true)}>{c.remove}</button>
    {removeOpen&&<AdminDialog title={c.removeTitle} onClose={()=>setRemoveOpen(false)} busy={busy} className="max-w-md"><div className="space-y-4 p-5"><h3 className="font-semibold">{c.removeTitle}</h3><p className="text-sm leading-relaxed">{c.removeWarning}</p>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} onClick={()=>setRemoveOpen(false)}>{c.cancel}</button><button type="button" className={`${button} border-red-700 bg-red-700 text-white`} onClick={()=>save(true)}>{c.removeConfirm}</button></div></div></AdminDialog>}
   </div>}
  </section>
  <div className="sticky bottom-0 z-10 rounded-xl border bg-white p-4 shadow-sm">
   {error&&!removeOpen&&<p role="alert" id="ai-settings-error" className="mb-3 break-words text-sm text-red-700">{error}</p>}
   <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-gray-600">{busy?c.saving:dirty?c.unsaved:base.version?`${c.saved} · ${c.version} ${base.version}`:c.notSaved}</span><div className="flex flex-wrap gap-2">{error&&<button type="button" className={button} disabled={busy||checking} onClick={()=>{if(!dirty||window.confirm(c.reloadWarning))void load()}}>{c.reload}</button>}<button className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy||checking} data-testid="ai-save">{busy?c.saving:c.save}</button></div></div>
  </div>
 </form>
}
