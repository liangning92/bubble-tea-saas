import {payrollLabels} from '../../../shared/payrollLabels'
import { useTranslation } from 'react-i18next'
import { probationLabels } from '../../../shared/probationLabels'
import { formatCurrency } from '../utils/helpers'
export function PayrollBasisSummary({basis}: {basis:any}) {
 const {i18n}=useTranslation(),l=probationLabels(i18n.language)
 if(!basis)return null
 return <section className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm space-y-2"><h3 className="font-semibold">{l.summary}</h3><p>{l.formal}: {formatCurrency(basis.formalMonthlySalary)} · {l.monthDays}: {basis.daysInMonth} · {l.eligible}: {basis.eligibleDays}</p>{basis.confirmationDate&&<p>{l.confirmation}: {basis.confirmationDate}</p>}<p>{l.formula}</p>{basis.segments?.map((s:any,i:number)=><p key={i}>{s.type==='probation'?l.probation:l.regular} · {s.startDate} — {s.endDate} · {formatCurrency(s.monthlyRate)} × {s.days} / {basis.daysInMonth} = {formatCurrency(s.amount)}</p>)}<p>{basis.paidRestDays>0&&<>{payrollLabels(i18n.language).paidRestCredit}: {basis.paidRestDays} · +{formatCurrency(basis.paidRestAmount)}</>}</p><p className="font-semibold">{l.total}: {formatCurrency(basis.amount)}</p>{basis.manualAdjustment&&<p>{l.manual} {l.recorded}: {formatCurrency(basis.recordedBaseSalary)}</p>}</section>
}
