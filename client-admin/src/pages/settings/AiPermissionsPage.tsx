import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import {PageHelp} from '../../components/PageHelp'
type Decision='deny'|'approval'|'automatic'
interface Policy {executionEnabled:false;read:{sales:boolean;inventory:boolean};actions:{refund:Decision;purchase:Decision;price:Decision}}
export function AiPermissionsPage(){
 const {t}=useTranslation();const {user}=useAuthStore()
 const [policy,setPolicy]=useState<Policy|null>(null);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('')
 const allowed=user?.role==='admin'&&!!user.storeId
 const load=async()=>{if(!allowed)return;setBusy(true);try{setPolicy((await api.get(`/ai/permissions/${user!.storeId}`)).data.data)}catch{setMessage(t('common.error'))}finally{setBusy(false)}}
 useEffect(()=>{setPolicy(null);void load()},[user?.id,user?.storeId,user?.role])
 const save=async()=>{if(!allowed||!policy)return;setBusy(true);try{await api.put(`/ai/permissions/${user!.storeId}`,policy);setPolicy((await api.get(`/ai/permissions/${user!.storeId}`)).data.data);setMessage(t('aiPermissions.saved'))}catch{setMessage(t('common.error'))}finally{setBusy(false)}}
 if(!allowed)return <p role="alert">{t('aiPermissions.denied')}</p>
 return <section className="card max-w-3xl space-y-5">
  <h1 className="text-xl font-bold">{t('aiPermissions.title')}</h1>
  <p className="text-sm text-amber-800">{t('pageHelp.aiDisabled')}</p>
  <PageHelp><p>{t('aiPermissions.disabled')}</p><p>{t('aiPermissions.draft')}</p></PageHelp>
  {policy&&<>
   <fieldset disabled={busy} className="space-y-3"><legend className="font-semibold">{t('aiPermissions.readScope')}</legend>{(['sales','inventory'] as const).map(key=><label key={key} className="flex gap-2"><input type="checkbox" checked={policy.read[key]} onChange={e=>setPolicy({...policy,read:{...policy.read,[key]:e.target.checked}})}/>{t(`aiPermissions.${key}`)}</label>)}</fieldset>
   <fieldset disabled={busy} className="space-y-3"><legend className="font-semibold">{t('aiPermissions.actions')}</legend>{(['refund','purchase','price'] as const).map(key=><label key={key} className="flex justify-between items-center gap-4">{t(`aiPermissions.${key}`)}<select className="border rounded p-2" value={policy.actions[key]} onChange={e=>setPolicy({...policy,actions:{...policy.actions,[key]:e.target.value as Decision}})}>{(['deny','approval','automatic'] as const).map(value=><option key={value} value={value}>{t(`aiPermissions.${value}`)}</option>)}</select></label>)}</fieldset>
   <button className="btn btn-primary" disabled={busy} onClick={()=>void save()}>{t('common.save')}</button>
  </>}
  {busy&&<p role="status">{t('common.loading')}</p>}{message&&<p role="status">{message}</p>}
 </section>
}
