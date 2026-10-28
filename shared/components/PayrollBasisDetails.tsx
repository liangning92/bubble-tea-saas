import { payrollPresentation, payrollMoney, lateRuleDescription } from '../payrollPresentation'
export function LateCalculation({correction,language}:{correction:any;language:string}) {
 const l=payrollPresentation(language),rule=correction?.lateRule
 if(!correction)return null
 return <div className="space-y-2 text-sm"><p>{l.lateMinutes}: {correction.lateMinutes} {l.minutes} · {l.lateDeduction}: {payrollMoney(correction.lateDeduction||0)}</p>
 {rule&&correction.lateMode!=='manual'&&<p>{l.ruleVersion}: {rule.version}</p>}<p className={correction.lateRuleRequired?'text-amber-700':''}>{lateRuleDescription(correction,language)}</p></div>
}
export function PayrollBasisDetails({basis,language,collapsed=true}:{basis:any;language:string;collapsed?:boolean}) {
 const l=payrollPresentation(language)
 if(!basis)return null
 const content=<div className="space-y-3 pt-3"><dl className="grid grid-cols-2 sm:grid-cols-3 gap-3"><div><dt className="text-gray-500">{l.contract}</dt><dd className="font-semibold">{payrollMoney(basis.formalMonthlySalary)}</dd></div><div><dt className="text-gray-500">{l.monthDays}</dt><dd>{basis.daysInMonth}</dd></div><div><dt className="text-gray-500">{l.employmentDays}</dt><dd>{basis.eligibleDays}</dd></div></dl><p>{l.source}: {basis.daysSource==='estimate'?l.estimate:basis.daysSource==='manual'?l.manual:l.attendance}{basis.version!==2&&` · ${l.historical}`}</p>
 {basis.segments?.map((s:any,i:number)=><div key={i} className="rounded-lg bg-gray-50 p-3"><p className="font-medium">{s.type==='probation'?l.probation:l.regular} · {s.startDate} — {s.endDate}</p><p>{basis.daysSource==='estimate'?l.estimatedDays:l.workDays}: {s.days} / {s.eligibleDays??s.days}</p><p>{payrollMoney(s.monthlyRate)} ÷ {basis.dailyRateDivisor??basis.daysInMonth} × {s.days} = {payrollMoney(s.amount)}</p></div>)}
 {basis.paidRestDays>0&&<p>{l.paidRest}: {basis.paidRestDays} · +{payrollMoney(basis.paidRestAmount)}</p>}
 {basis.unpaidLeave?.paidDays>0&&<p>{l.paidRest}: {basis.unpaidLeave.paidDays}</p>}
 <p className="font-semibold">{l.base}: {payrollMoney(basis.recordedBaseSalary??basis.amount)}</p>{basis.manualAdjustment&&<p>{l.manualAdjustment}: {payrollMoney(basis.recordedBaseSalary)}</p>}<LateCalculation correction={basis.correction} language={language}/>{basis.reason&&<p>{l.reason}: {basis.reason}</p>}</div>
 return collapsed?<details className="border rounded-xl p-4 text-sm"><summary className="cursor-pointer font-semibold">{l.basis}</summary>{content}</details>:<section className="border rounded-xl p-4 text-sm"><h3 className="font-semibold">{l.basis}</h3>{content}</section>
}
