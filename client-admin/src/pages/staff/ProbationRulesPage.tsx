import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { staffApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { useEmployeePermission } from '../../contexts/EmployeeAccess'
import { probationLabels } from '../../../../shared/probationLabels'

export function ProbationRulesPage() {
 const {i18n}=useTranslation(),l=probationLabels(i18n.language),{user}=useAuthStore(),permission=useEmployeePermission('salary.write')
 const canEdit=user?.role==='admin'&&permission
 const [form,setForm]=useState({enabled:false,durationUnit:'months',duration:'',salaryMode:'percentage',salaryValue:''}),[message,setMessage]=useState(''),[saving,setSaving]=useState(false)
 const query=useQuery({queryKey:['probation-rule',user?.storeId],queryFn:()=>staffApi.probationRule()})
 useEffect(()=>{const r=query.data?.data?.data;if(r)setForm({enabled:r.enabled,durationUnit:r.durationUnit||'months',duration:r.duration===undefined?'':String(r.duration),salaryMode:r.salaryMode||'percentage',salaryValue:r.salaryValue===undefined?'':String(r.salaryValue)})},[query.data])
 const save=async(e:React.FormEvent)=>{e.preventDefault();if(!canEdit||saving)return;setSaving(true);setMessage('');try{await staffApi.saveProbationRule({...form,duration:Number(form.duration||1),salaryValue:Number(form.salaryValue||100)});setMessage(l.saved);await query.refetch()}catch(e:any){setMessage(e?.response?.data?.message||l.error)}finally{setSaving(false)}}
 if(query.isLoading)return <p>…</p>
 if(query.isError)return <p role="alert">{l.loadError}<button className="btn-secondary" onClick={()=>query.refetch()}>↻</button></p>
 return <section className="card max-w-3xl"><h1 className="text-xl font-bold mb-4">{l.title}</h1><p className="text-sm text-gray-600 mb-5">{l.note}</p><form onSubmit={save} className="space-y-5"><fieldset disabled={!canEdit||saving} className="space-y-5">
 <label className="flex gap-2"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/>{l.enabled}</label>
 <div><label htmlFor="probation-duration">{l.duration}</label><div className="flex gap-3"><input id="probation-duration" type="number" className="input" min="1" max={form.durationUnit==='months'?24:730} step="1" required={form.enabled} value={form.duration} onChange={e=>setForm({...form,duration:e.target.value})}/><select aria-label={l.duration} className="input" value={form.durationUnit} onChange={e=>setForm({...form,durationUnit:e.target.value})}><option value="months">{l.months}</option><option value="days">{l.days}</option></select></div></div>
 <label className="block">{l.mode}<select className="input" value={form.salaryMode} onChange={e=>setForm({...form,salaryMode:e.target.value})}><option value="percentage">{l.percentage}</option><option value="fixed">{l.fixed}</option></select></label>
 <label className="block">{l.value} ({form.salaryMode==='percentage'?'%':'IDR'})<input type="number" min="1" max={form.salaryMode==='percentage'?100:2000000000} step="1" required={form.enabled} className="input" value={form.salaryValue} onChange={e=>setForm({...form,salaryValue:e.target.value})}/></label>
 <button className="btn-primary" disabled={saving}>{l.save}</button></fieldset>{message&&<p role="status">{message}</p>}</form></section>
}
