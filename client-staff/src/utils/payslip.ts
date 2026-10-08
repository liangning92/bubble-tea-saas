import { formatCurrency } from './helpers'

const escapeText = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))

export function payslipHtml(salary: any, labels: Record<string, string>): string {
  const rows = ['baseSalary', 'overtimePay', 'commissions', 'bonuses', 'compensationPenalties', 'depositDeductionAmount', 'otherDeductions', 'deductions', 'totalSalary']
    .map(key => `<tr><th>${escapeText(labels[key] || key)}</th><td>${escapeText(formatCurrency(salary[key] || 0))}</td></tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeText(labels.title)} ${escapeText(salary.month)}</title><style>body{font:16px sans-serif;max-width:640px;margin:40px auto;padding:20px}table{border-collapse:collapse;width:100%}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}td{text-align:right}tr:last-child{font-weight:bold}</style></head><body><h1>${escapeText(labels.title)}</h1><p>${escapeText(salary.staffName)} · ${escapeText(salary.month)}</p><table>${rows}</table></body></html>`
}

export function downloadPayslip(salary: any, labels: Record<string, string>) {
  const url = URL.createObjectURL(new Blob([payslipHtml(salary, labels)], { type: 'text/html;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `salary-${String(salary.month).replace(/[^0-9-]/g, '')}.html`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
