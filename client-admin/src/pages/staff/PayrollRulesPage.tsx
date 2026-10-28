import {attendanceNavigationLabels} from '../../../../shared/attendanceNavigationLabels'
import {useEffect,useState} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {useTranslation} from 'react-i18next'
import {Link} from 'react-router-dom'
import {staffApi} from '../../services/api'
import {useAuthStore} from '../../stores/auth'
import {payrollLabels} from '../../../../shared/payrollLabels'
import {staffRuleLabels} from '../../../../shared/staffRuleLabels'
import {defaultStaffRules,leaveRestrictionMessage,type StaffRules} from '../../../../shared/staffRulePolicy'

export function PayrollRulesPage(){
 const {i18n,t}=useTranslation(),l=payrollLabels(i18n.language),c=staffRuleLabels(i18n.language),{user}=useAuthStore(),cache=useQueryClient()
 const [rules,setRules]=useState<StaffRules>(defaultStaffRules),[message,setMessage]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false)
 const query=useQuery({queryKey:['payroll-rules',user?.storeId],queryFn:()=>staffApi.payrollRules()})
 useEffect(()=>{if(query.data)setRules({...defaultStaffRules,...query.data.data.data})},[query.data])
 const update=<K extends keyof StaffRules>(key:K,value:StaffRules[K])=>{setRules(prev=>({...prev,[key]:value}));setMessage('');setError('')}
 const save=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setMessage('');setError('');try{await staffApi.savePayrollRules(rules);await cache.invalidateQueries();setMessage(l.rulesSaved)}catch(error:any){setError(error?.response?.data?.message||t('common.error'))}finally{setSaving(false)}}
 if(query.isLoading)return <p>{t('common.loading')}</p>
 if(query.isError)return <div role="alert"><p>{t('common.error')}</p><button className="btn-secondary" onClick={()=>query.refetch()}>{c.retry}</button></div>
 const number=(key:keyof StaffRules,label:string,max:number,step=0.5,min=0)=><label className="block text-sm font-medium">{label}<input className="input mt-1 w-full" type="number" required min={min} max={max} step={step} value={rules[key] as number} onChange={e=>update(key,Number(e.target.value))}/></label>
 const weekdays=Array.from({length:7},(_,day)=>({day,name:new Intl.DateTimeFormat(i18n.language.startsWith('zh')?'zh-CN':i18n.language.startsWith('id')?'id-ID':'en-GB',{weekday:'long'}).format(new Date(2024,0,7+day))}))
 return <section className="max-w-4xl space-y-5">
  <div><h1 className="text-xl font-bold">{c.title}</h1><p className="mt-2 text-sm text-gray-600">{c.intro}</p></div>
  <form onSubmit={save} className="space-y-5"><fieldset disabled={user?.role!=='admin'||saving} className="space-y-5 min-w-0">
   <div className="card space-y-4"><h2 className="font-semibold">{c.pay}</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{number('paidRestDays',c.paidDays,31)}<label className="block text-sm font-medium">{c.eligibility}<select disabled className="input mt-1 w-full" value="full_month" onChange={e=>update('paidRestEligibility',e.target.value as StaffRules['paidRestEligibility'])}><option value="full_month">{c.full}</option></select></label></div><p className="text-sm text-gray-600">{c.paidHint}</p></div>
   <div className="card space-y-4"><h2 className="font-semibold">{c.leave}</h2><fieldset><legend className="text-sm mb-2">{c.blocked}</legend><div className="flex flex-wrap gap-3">{weekdays.map(({day,name})=><label key={day} className="inline-flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={rules.blockedLeaveWeekdays.includes(day)} onChange={e=>update('blockedLeaveWeekdays',e.target.checked?[...rules.blockedLeaveWeekdays,day].sort():rules.blockedLeaveWeekdays.filter(d=>d!==day))}/>{name}</label>)}</div></fieldset><p className="text-sm text-gray-600">{leaveRestrictionMessage(rules.blockedLeaveWeekdays,i18n.language)}</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rules.allowHalfDayLeave} onChange={e=>update('allowHalfDayLeave',e.target.checked)}/>{c.half}</label></div>
   <div className="card space-y-4"><h2 className="font-semibold">{c.balances}</h2><p className="text-sm text-gray-600">{c.balanceHint}</p><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{number('annualLeaveDays',c.annual,366)}{number('sickLeaveDays',c.sick,366)}</div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rules.tenureBonusEnabled} onChange={e=>update('tenureBonusEnabled',e.target.checked)}/>{c.tenure}</label>{rules.tenureBonusEnabled&&<div className="grid grid-cols-1 md:grid-cols-2 gap-4">{number('tenureBonusYears',c.years,100,1,1)}{number('tenureAnnualLeaveDays',c.tenureDays,366)}</div>}</div>
   <div className="card space-y-4"><h2 className="font-semibold">{c.salary}</h2><p className="text-sm text-gray-600">{c.salaryHint}</p><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{number('dailyRateDivisor',c.divisor,366,0.5,1)}{number('overtimeMonthlyHours',c.hours,744,0.5,1)}</div></div>
   <div className="card space-y-4"><h2 className="font-semibold">{c.bonus}</h2><p className="text-sm text-gray-600">{c.bonusHint}</p><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{number('attendanceBonusDays',c.bonusDays,31)}{number('attendanceBonusAmount',c.bonusAmount,2000000000,1)}</div></div>
   <button type="submit" className="btn-primary">{saving?t('common.loading'):l.saveRules}</button>
  </fieldset>{message&&<p role="status" className="text-green-700">{message}</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}</form>
  <div className="card"><h2 className="font-semibold mb-3">{c.others}</h2><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[[c.features,'/staff/features'],[c.attendance,'/staff/attendance/rules'],[attendanceNavigationLabels(i18n.language).late,'/staff/attendance/late-rules'],[c.types,'/staff/attendance/leave/types'],[c.probation,'/staff/salary/probation-rules'],[c.deposit,'/staff/salary/deposit-rules'],[c.points,'/staff/points/rules']].map(([label,to])=><Link key={to} to={to} className="text-primary underline text-sm">{label}</Link>)}</div></div>
 </section>
}
