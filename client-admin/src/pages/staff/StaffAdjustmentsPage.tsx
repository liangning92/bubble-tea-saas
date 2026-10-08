import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { salaryApi, staffApi } from '../../services/api'
import { useAuthStore } from '../../stores/auth'

export function StaffAdjustmentsPage() {
  const {t}=useTranslation(),{user}=useAuthStore()
  const [records,setRecords]=useState<any[]>([]),[staff,setStaff]=useState<any[]>([])
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[open,setOpen]=useState(false)
  const [form,setForm]=useState({staffId:'',month:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Jakarta'}).slice(0,7),type:'reward',amount:'',reason:''})
  const requestId=useRef('')
  const [periodStatus,setPeriodStatus]=useState<string|null>(null)
  useEffect(()=>{if(!open||!form.staffId||!form.month)return;let current=true;setPeriodStatus('loading');salaryApi.depositPlan(form.staffId,form.month).then(r=>{if(current)setPeriodStatus(r.data.data.salaryStatus)}).catch(()=>{if(current)setPeriodStatus('error')});return()=>{current=false}},[open,form.staffId,form.month])
  const load=async()=>{setLoading(true);setError('');try{const [r,s]=await Promise.all([salaryApi.adjustments(),staffApi.list({pageSize:100})]);setRecords(r.data.data.list);setStaff(s.data.data.list)}catch{setError(t('common.error'))}finally{setLoading(false)}}
  useEffect(()=>{void load()},[])
  const money=(n:number)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n)
  const save=async(e:React.FormEvent)=>{e.preventDefault();if(saving||periodStatus==='paid'||periodStatus==='loading'||periodStatus==='error')return;setSaving(true);setError('');try{await salaryApi.createAdjustment({...form,amount:Number(form.amount),requestId:requestId.current});setOpen(false);await load()}catch(e:any){setError(e.response?.data?.message||t('common.error'))}finally{setSaving(false)}}
  const cancel=async(id:string)=>{if(saving||!confirm(t('compensation.cancelConfirm')))return;setSaving(true);try{await salaryApi.cancelAdjustment(id);await load()}catch(e:any){setError(e.response?.data?.message||t('common.error'))}finally{setSaving(false)}}
  return <section className="p-4 space-y-4">
    <div className="flex justify-between items-center"><h1 className="text-xl font-bold">{t('compensation.title')}</h1><button className="btn-primary" disabled={user?.role!=='admin'||saving} onClick={()=>{requestId.current=crypto.randomUUID();setPeriodStatus(null);setError('');setForm(prev=>({...prev,staffId:'',type:'reward',amount:'',reason:''}));setOpen(true)}}>{t('compensation.add')}</button></div>
    <p className="text-sm text-gray-500">{t('compensation.hint')}</p>
    {error&&<p role="alert" className="text-red-600">{error}</p>}
    {loading?<p role="status">{t('common.loading')}</p>:records.length===0?<p>{t('compensation.empty')}</p>:<div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{['staff','month','type','amount','reason','status'].map(k=><th key={k} className="p-3">{t('compensation.'+k)}</th>)}<th /></tr></thead><tbody>{records.map(r=><tr key={r.id} className="border-b"><td className="p-3">{r.staffName}</td><td>{r.month}</td><td>{t('compensation.'+r.type)}</td><td className={r.type==='reward'?'text-green-700':'text-red-600'}>{r.type==='reward'?'+':'−'}{money(r.amount)}</td><td className="max-w-xs break-words">{r.reason}</td><td>{t('compensation.'+r.status)}</td><td>{r.status==='active'&&user?.role==='admin'&&<button disabled={saving||r.payrollStatus==='paid'} title={r.payrollStatus==='paid'?t('compensation.paidLocked'):undefined} onClick={()=>cancel(r.id)}>{t('compensation.cancel')}</button>}</td></tr>)}</tbody></table></div>}
    {open&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><form onSubmit={save} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4"><h2 className="text-lg font-bold">{t('compensation.add')}</h2>
      <label className="block">{t('compensation.staff')} *<select aria-label={t('compensation.staff')} required value={form.staffId} onChange={e=>setForm({...form,staffId:e.target.value})} className="input"><option value="">{t('common.select')}</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name} ({s.employeeNumber})</option>)}</select></label>
      <label className="block">{t('compensation.month')} *<input aria-label={t('compensation.month')} className="input" type="month" required value={form.month} onChange={e=>setForm({...form,month:e.target.value})}/></label>
      <label className="block">{t('compensation.type')}<select aria-label={t('compensation.type')} className="input" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="reward">{t('compensation.reward')}</option><option value="penalty">{t('compensation.penalty')}</option></select></label>
      <label className="block">{t('compensation.amount')} (Rp) *<input aria-label={t('compensation.amount')} className="input" type="number" min="1" max="2000000000" step="1" required value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
      <label className="block">{t('compensation.reason')} *<textarea aria-label={t('compensation.reason')} className="input" required maxLength={1000} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></label>
      {periodStatus==='paid'&&<p role="alert" className="text-amber-700">{t('compensation.paidLocked')}</p>}
      {periodStatus==='error'&&<p role="alert">{t('common.error')}</p>}
      {error&&<p role="alert" className="text-red-600">{error}</p>}
      <div className="flex gap-3"><button type="button" disabled={saving} onClick={()=>setOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={saving||periodStatus==='paid'||periodStatus==='loading'||periodStatus==='error'} type="submit">{saving?t('common.loading'):t('common.save')}</button></div>
    </form></div>}
  </section>
}
