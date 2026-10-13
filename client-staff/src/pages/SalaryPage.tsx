import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { staffApi } from '../services/api'
import { Wallet, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import { LoadFailure } from '../components/LoadFailure'
import { downloadPayslip } from '../utils/payslip'
import { formatCurrency } from '../utils/helpers'
import { payrollPresentation, payrollStatus } from '../../../shared/payrollPresentation'
import { PayrollBasisDetails } from '../../../shared/components/PayrollBasisDetails'

export function SalaryPage() {
 const {t,i18n}=useTranslation(),l=payrollPresentation(i18n.language),{user}=useAuthStore()
 const [currentMonth,setCurrentMonth]=useState(()=>{const now=new Date(Date.now()+7*3600000);return new Date(now.getUTCFullYear(),now.getUTCMonth(),1)})
 const [loadError,setLoadError]=useState(false),[retryCount,setRetryCount]=useState(0)
 const [salary,setSalary]=useState<any>(null),[isLoading,setIsLoading]=useState(true)
 useEffect(()=>{
  let active=true;setSalary(null);setLoadError(false);setIsLoading(true)
  if(!user?.staffId){setIsLoading(false);return}
  staffApi.getMySalary(user.staffId,currentMonth.getMonth()+1,currentMonth.getFullYear()).then(response=>{if(active)setSalary(response.data||null)}).catch(()=>{if(active)setLoadError(true)}).finally(()=>{if(active)setIsLoading(false)})
  return ()=>{active=false}
 },[user?.staffId,currentMonth,retryCount])
 const moveMonth=(offset:number)=>setCurrentMonth(previous=>new Date(previous.getFullYear(),previous.getMonth()+offset,1))
 const monthText=currentMonth.toLocaleDateString(i18n.language.startsWith('zh')?'zh-CN':i18n.language.startsWith('en')?'en-US':'id-ID',{month:'long',year:'numeric'})
 if(loadError)return <LoadFailure retry={()=>setRetryCount(n=>n+1)}/>
 const late=salary?.payrollBasis?.correction?.lateDeduction||salary?.latePenalty||0
 const penalties=salary?.compensationPenalties||0,deposit=salary?.depositDeductionAmount||0
 const other=salary?Math.max(0,salary.deductions-late-penalties-deposit-(salary.payrollBasis?.unpaidLeave?.deduction||0)):0
 const rows=salary?[[l.base,salary.baseSalary],[l.overtime,salary.overtimePay||0],[l.commission,salary.commissions||0],[l.reward,salary.bonuses||0],[l.lateDeduction,-late],[l.penalty,-penalties],[l.deposit,-deposit],[l.unpaidLeave,-(salary.payrollBasis?.unpaidLeave?.deduction||0)],[l.depositRefund,salary.depositRefundAmount||0],[l.otherDeduction,-other]]:[]
 return <div className="min-h-screen bg-gray-50 pb-20"><header className="bg-primary text-white px-4 py-6"><div className="flex items-center gap-3"><Wallet size={28}/><h1 className="text-xl font-bold">{t('salary.title')}</h1></div></header>
 <nav className="bg-white border-b px-4 py-3 flex items-center justify-between"><button aria-label={l.previousMonth} onClick={()=>moveMonth(-1)} className="p-2"><ChevronLeft/></button><span className="font-bold">{monthText}</span><button aria-label={l.nextMonth} onClick={()=>moveMonth(1)} className="p-2"><ChevronRight/></button></nav>
 <main className="p-4 max-w-3xl mx-auto space-y-4">{isLoading?<div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary"/></div>:salary?<>
 <section className="bg-primary rounded-2xl p-6 text-white"><p className="text-sm opacity-90">{payrollStatus(salary,i18n.language)}</p><p className="text-3xl sm:text-4xl font-bold my-3">{formatCurrency(salary.settlementAmount??salary.totalSalary)}</p><p>{salary.staffName}</p></section>
 {(salary.status!=='paid'&&!salary.payrollBasis?.confirmed)&&<p className="text-sm bg-blue-50 rounded-xl p-4 text-blue-800">{l.estimateHint}</p>}
 {salary.originalFinalAmount!==undefined&&<p className="text-sm text-gray-600">{l.originalAmount}: {formatCurrency(salary.originalFinalAmount)} · {l.difference}: {formatCurrency(salary.totalSalary-salary.originalFinalAmount)}</p>}
 {salary.status==='pending'&&salary.payrollBasis?.version!==2&&<p className="text-sm text-amber-700">{l.legacy}</p>}
 <section className="bg-white border rounded-xl p-4"><h2 className="font-semibold mb-3">{l.breakdown}</h2><dl className="space-y-3 text-sm">{rows.map(([label,amount])=><div className="flex justify-between gap-4" key={String(label)}><dt className="text-gray-500">{label}</dt><dd className={Number(amount)<0?'text-red-600':'font-medium'}>{formatCurrency(Number(amount)||0)}</dd></div>)}<div className="flex justify-between border-t pt-3"><dt>{l.totalDeduction}</dt><dd>{formatCurrency(salary.deductions)}</dd></div><div className="flex justify-between font-bold border-t pt-3"><dt>{salary.status!=='paid'&&!salary.payrollBasis?.confirmed?l.estimatedTotal:l.settlementTotal}</dt><dd>{formatCurrency(salary.settlementAmount??salary.totalSalary)}</dd></div></dl></section>
 {!!salary.compensationItems?.length&&<details className="bg-white rounded-xl border p-4 text-sm"><summary>{t('compensation.title')}</summary><ul className="space-y-2 pt-3">{salary.compensationItems.map((item:any)=><li key={item.id}>{t('compensation.'+item.type)} {formatCurrency(item.amount)} · {item.reason}</li>)}</ul></details>}
 <PayrollBasisDetails basis={salary.payrollBasis} language={i18n.language}/>
 <button onClick={()=>downloadPayslip(salary,{...l,title:t('salary.title'),language:i18n.language})} className="w-full py-4 bg-white border border-primary text-primary rounded-xl font-bold flex items-center justify-center gap-2"><Download size={20}/>{t('salary.downloadSlip')}</button>
 </>:<div className="text-center py-12 text-gray-400"><Wallet className="mx-auto mb-4"/><p>{t('salary.noData')}</p></div>}</main></div>
}
