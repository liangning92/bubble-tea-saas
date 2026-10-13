import { payrollPresentation, payrollStatus, lateRuleDescription } from '../../../shared/payrollPresentation'
import { formatCurrency } from './helpers'

const escapeText = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))

export function payslipHtml(salary: any, labels: Record<string, string>): string {
  const l=payrollPresentation(labels.language||'id'),basis=salary.payrollBasis,late=basis?.correction?.lateDeduction||salary.latePenalty||0
  const penalties=salary.compensationPenalties||0,deposit=salary.depositDeductionAmount||0
  const components=[[l.base,salary.baseSalary],[l.overtime,salary.overtimePay||0],[l.commission,salary.commissions||0],[l.reward,salary.bonuses||0],[l.lateDeduction,-late],[l.penalty,-penalties],[l.deposit,-deposit],[l.otherDeduction,-Math.max(0,salary.deductions-late-penalties-deposit)],[l.totalDeduction,salary.deductions],[basis?.daysSource==='estimate'?l.estimatedTotal:l.total,salary.totalSalary]]
  const rows=components.map(([label,amount])=>`<tr><th>${escapeText(label)}</th><td>${escapeText(formatCurrency(Number(amount)||0))}</td></tr>`).join('')
  const basisHtml=basis?`<h2>${escapeText(l.basis)}</h2><p>${escapeText(l.contract)}: ${escapeText(formatCurrency(basis.formalMonthlySalary))} · ${escapeText(l.monthDays)}: ${basis.daysInMonth} · ${escapeText(l.employmentDays)}: ${basis.eligibleDays}</p><p>${escapeText(l.source)}: ${escapeText(basis.daysSource==='estimate'?l.estimate:basis.daysSource==='manual'?l.manual:l.attendance)} · v${escapeText(basis.version)}</p>${basis.segments.map((segment:any)=>`<p>${escapeText(segment.type==='probation'?l.probation:l.regular)} · ${escapeText(segment.startDate)} — ${escapeText(segment.endDate)}<br>${escapeText(formatCurrency(segment.monthlyRate))} ÷ ${basis.daysInMonth} × ${segment.days} = ${escapeText(formatCurrency(segment.amount))}</p>`).join('')}${basis.paidRestDays>0?`<p>${escapeText(l.paidRest)}: ${basis.paidRestDays} · ${escapeText(formatCurrency(basis.paidRestAmount))}</p>`:''}${basis.correction?`<p>${escapeText(l.lateMinutes)}: ${basis.correction.lateMinutes} · ${escapeText(l.lateDeduction)}: ${escapeText(formatCurrency(late))} · ${escapeText(l.ruleVersion)}: ${escapeText(basis.correction.lateMode==='manual'?l.manualLate:basis.correction.lateRule?.version||l.noMinuteRule)}</p><p>${escapeText(lateRuleDescription(basis.correction,labels.language||'id'))}</p>`:''}${basis.reason?`<p>${escapeText(l.reason)}: ${escapeText(basis.reason)}</p>`:''}`:''
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeText(labels.title)} ${escapeText(salary.month)}</title><style>body{font:16px sans-serif;max-width:640px;margin:40px auto;padding:20px}table{border-collapse:collapse;width:100%}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}td{text-align:right}tr:last-child{font-weight:bold}p{line-height:1.6}</style></head><body><h1>${escapeText(labels.title)}</h1><p>${escapeText(salary.staffName)} · ${escapeText(salary.month)} · ${escapeText(payrollStatus(salary,labels.language||'id'))}</p>${basis?.daysSource==='estimate'?`<p>${escapeText(l.estimateHint)}</p>`:''}<table>${rows}</table>${basisHtml}</body></html>`
}

export function downloadPayslip(salary: any, labels: Record<string, string>) {
  const url = URL.createObjectURL(new Blob([payslipHtml(salary, labels)], { type: 'text/html;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `salary-${String(salary.month).replace(/[^0-9-]/g, '')}.html`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
