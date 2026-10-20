import { useEffect, useRef, useState } from 'react'
import type { TeamClient } from '../../../../shared/TeamCommunication'
import { externalAgentCopy } from './externalAgentCopy'

type Tool = 'tasks.read' | 'messages.read' | 'task.suggest'
type Record = { id:string; name:string; clientType:'mcp_compatible'|'adapter_required'; version:number; authVersion:number; clientRevision:number; channelIds:string[]; tools:Tool[]; authState:string; connectionState:string }
type Audit = { at:string; actorId:string; registrationId:string; version:number; action:string }
const field='mt-1 w-full min-w-0 rounded-lg border bg-white p-2.5 text-sm'
const button='rounded-lg border px-3 py-2 text-sm disabled:opacity-50'
export function ExternalAgentSettings({client,storeId,language}:{client:Pick<TeamClient,'request'|'current'>;storeId:string;language:string}) {
 const c=externalAgentCopy(language), epoch=useRef(0), mounted=useRef(true)
 const [rows,setRows]=useState<Record[]>([]),[audits,setAudits]=useState<Audit[]>([]),[base,setBase]=useState<Record|null>(null)
 const [name,setName]=useState(''),[type,setType]=useState<Record['clientType']>('mcp_compatible'),[channels,setChannels]=useState(''),[tools,setTools]=useState<Tool[]>([])
 const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[removing,setRemoving]=useState(false),[uncertain,setUncertain]=useState(false)
 const current=(ticket:number)=>mounted.current&&client.current()&&epoch.current===ticket
 function select(record:Record|null){setBase(record);setName(record?.name||'');setType(record?.clientType||'mcp_compatible');setChannels(record?.channelIds.join(', ')||'');setTools(record?.tools||[]);setRemoving(false);setError('');setNotice('')}
 async function load(){const ticket=++epoch.current;setBusy(true);setError('');try{
  const [list,history]=await Promise.all([client.request('get','/external-access'),client.request('get','/external-access/audits')])
  if(!current(ticket))return
  if(!Array.isArray(list)||!Array.isArray(history))throw Error('invalid response')
  setRows(list);setAudits(history);setLoaded(true);setUncertain(false);select(base?list.find(r=>r.id===base.id)||null:null)
 }catch{if(current(ticket)){setError(c.error);setLoaded(false)}}finally{if(current(ticket))setBusy(false)}}
 useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false;epoch.current++}},[client])
 const dirty=name!==(base?.name||'')||type!==(base?.clientType||'mcp_compatible')||channels!==(base?.channelIds.join(', ')||'')||JSON.stringify(tools)!==JSON.stringify(base?.tools||[])
 async function mutate(action:'save'|'revoke'|'validate'|'remove'){
  if(busy||uncertain||!loaded||!client.current())return
  const channelIds=channels.split(',').map(x=>x.trim()).filter(Boolean)
  if(action==='save'&&(!name.trim()||channelIds.some(x=>!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(x)))){setError(c.invalid);return}
  const ticket=++epoch.current;setBusy(true);setError('');setNotice('')
  try{
   const url='/external-access'+(base?'/'+base.id:'')+(action==='revoke'||action==='validate'||action==='remove'?'/'+action:'')
   const method=action==='save'?(base?'put':'post'):'post'
   const data=action==='save'?{expectedVersion:base?.version||0,name:name.trim(),clientType:type,enabled:false,storeIds:[storeId],channelIds:[...new Set(channelIds)],tools,approvalRequired:true}:{expectedVersion:base!.version}
   const result=await client.request(method,url,data)
   if(!current(ticket))return
   if(action==='remove'){setRows(old=>old.filter(r=>r.id!==base!.id));select(null)}
   else if(action==='validate'){setRows(old=>old.map(r=>r.id===base!.id?{...r,connectionState:'configuration_validated'}:r));setBase(old=>old?{...old,connectionState:'configuration_validated'}:old);setNotice(c.checked)}
   else{setRows(old=>[...old.filter(r=>r.id!==result.id),result]);select(result);setNotice(action==='save'?c.saved:c.revoked)}
   try{const history=await client.request('get','/external-access/audits');if(current(ticket)&&Array.isArray(history))setAudits(history)}catch{if(current(ticket))setError(c.error)}
  }catch(e:any){if(current(ticket)){const status=e?.response?.status;setError(status===409?c.conflict:status>=400&&status<500?c.error:c.unknown);setUncertain(true)}}finally{if(current(ticket))setBusy(false)}
 }
 return <section className="card space-y-4" data-testid="external-agent-settings" aria-labelledby="external-agent-title">
  <header><h3 id="external-agent-title" className="text-lg font-semibold">{c.title}</h3><p className="mt-2 text-sm text-gray-600">{c.detail}</p></header>
  <p className="rounded-lg bg-amber-50 p-3 text-sm" data-testid="external-production-state">{c.disabled}<br/>{c.unavailable}</p>
  <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy||!loaded||uncertain||dirty} onClick={()=>select(null)}>{c.create}</button><button type="button" className={button} disabled={busy} onClick={()=>void load()}>{c.refresh}</button></div>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
  {!loaded?<p>{busy?c.loading:c.error}</p>:<>
   {rows.length===0?<p className="text-sm text-gray-600">{c.empty}</p>:<ul className="space-y-2">{rows.map(r=><li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div className="min-w-0 break-words"><strong>{r.name}</strong><p className="text-xs text-gray-600">{c.version} {r.version} · {r.authState==='revoked'?c.revoked:c.unconfigured}</p></div><button type="button" className={button} disabled={busy||uncertain||dirty} onClick={()=>select(r)}>{c.edit}</button></li>)}</ul>}
   <form onSubmit={e=>{e.preventDefault();void mutate('save')}} className="space-y-4" data-testid="external-agent-form">
    {base&&<p className="text-sm" data-testid="external-selected-version">{c.version} {base.version} · {c.authVersion} {base.authVersion} · {c.clientVersion} {base.clientRevision}<br/>{base.connectionState==='configuration_validated'?c.checked:c.untested}</p>}
    <fieldset disabled={busy||uncertain} className="space-y-4">
     <div className="grid gap-4 md:grid-cols-2"><label className="min-w-0 text-sm">{c.name}<input className={field} maxLength={80} value={name} onChange={e=>setName(e.target.value)} data-testid="external-name"/></label><label className="min-w-0 text-sm">{c.type}<select className={field} value={type} onChange={e=>setType(e.target.value as Record['clientType'])} data-testid="external-type"><option value="mcp_compatible">{c.compatible}</option><option value="adapter_required">{c.adapter}</option></select></label></div>
     <p className="break-all text-sm">{c.store}: {storeId}</p><label className="block text-sm">{c.channels}<textarea className={field} rows={2} value={channels} onChange={e=>setChannels(e.target.value)} data-testid="external-channels"/></label>
     <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">{c.scope}</legend>{(['tasks.read','messages.read','task.suggest'] as Tool[]).map((tool,i)=><label key={tool} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={tools.includes(tool)} onChange={e=>setTools(old=>e.target.checked?[...old,tool]:old.filter(x=>x!==tool))} data-testid={'external-tool-'+i}/>{[c.tasks,c.messages,c.suggest][i]}</label>)}</fieldset>
     <p className="text-sm text-gray-600">{c.approval}</p>{dirty&&<p className="text-sm">{c.dirty}</p>}
     <div className="flex flex-wrap gap-2"><button className={button} type="submit" data-testid="external-save">{busy?c.pending:c.save}</button>{base&&<><button className={button} type="button" disabled={dirty||base.clientType==='adapter_required'} onClick={()=>void mutate('validate')} data-testid="external-validate">{c.validate}</button><button className={button} type="button" disabled={dirty} onClick={()=>void mutate('revoke')} data-testid="external-revoke">{c.revoke}</button><button className={button} type="button" disabled={dirty} onClick={()=>setRemoving(true)} data-testid="external-remove">{c.remove}</button></>}</div>
     {removing&&<div className="flex flex-wrap gap-2 rounded-lg border p-3"><button type="button" className={button} onClick={()=>void mutate('remove')} data-testid="external-confirm-remove">{c.confirm}</button><button type="button" className={button} onClick={()=>setRemoving(false)}>{c.cancel}</button></div>}
    </fieldset>
   </form>
   <details><summary className="cursor-pointer text-sm font-medium">{c.audits}</summary>{audits.length===0?<p className="mt-2 text-sm">{c.none}</p>:<ul className="mt-2 space-y-2 text-xs" data-testid="external-audits">{audits.slice().reverse().map((a,i)=><li className="break-all rounded border p-2" key={i}>{c.action}: {a.action==='save'?c.save:a.action==='revoke'?c.revoke:a.action==='remove'?c.remove:c.validate} · {c.version} {a.version}<br/>{c.actor}: {a.actorId} · {c.date}: {a.at}<br/>{c.registration}: {a.registrationId}</li>)}</ul>}</details>
  </>}
 </section>
}
