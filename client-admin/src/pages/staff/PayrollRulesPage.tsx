import {useEffect,useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {useTranslation} from 'react-i18next'
import {staffApi} from '../../services/api'
import {useAuthStore} from '../../stores/auth'
import {payrollLabels} from '../../../../shared/payrollLabels'
export function PayrollRulesPage(){
 const {i18n,t}=useTranslation(),l=payrollLabels(i18n.language),{user}=useAuthStore()
 const [days,setDays]=useState('2'),[message,setMessage]=useState(''),[saving,setSaving]=useState(false)
 const query=useQuery({queryKey:['payroll-rules',user?.storeId],queryFn:()=>staffApi.payrollRules()})
 useEffect(()=>{if(query.data)setDays(String(query.data.data.data.paidRestDays))},[query.data])
 const save=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setMessage('');try{await staffApi.savePayrollRules({paidRestDays:Number(days),blockWeekendLeave:true});setMessage(l.rulesSaved);await query.refetch()}catch(error:any){setMessage(error?.response?.data?.message||t('common.error'))}finally{setSaving(false)}}
 if(query.isLoading)return <p>{t('common.loading')}</p>
 if(query.isError)return <p role="alert">{t('common.error')}</p>
 return <section className="card max-w-3xl space-y-4"><h1 className="text-xl font-bold">{l.rules}</h1><p className="text-sm text-gray-600">{l.ruleHint}</p><form onSubmit={save} className="space-y-4"><fieldset disabled={user?.role!=='admin'||saving} className="space-y-4"><label className="block">{l.paidRest}<input className="input" type="number" required min="0" max="31" step="0.5" value={days} onChange={e=>setDays(e.target.value)}/></label><p>{l.weekendRule}</p><button className="btn-primary">{l.saveRules}</button></fieldset>{message&&<p role="status">{message}</p>}</form></section>
}
