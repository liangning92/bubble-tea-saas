export type ExpenseCategory = { key: string; label?: string; labelZh?: string; labelEn?: string; labelId?: string; posVisible?: boolean }
const names: Record<string, [string, string, string]> = {
  rent: ['租金', 'Rent', 'Sewa'], utilities: ['水电费', 'Utilities', 'Utilitas'],
  supplies: ['物资采购', 'Supplies', 'Pengadaan Barang'], salary: ['工资', 'Salary', 'Gaji'],
  reimbursement: ['报销', 'Reimbursement', 'Penggantian biaya'], other: ['其他', 'Other', 'Lainnya']
}
export const visibleInPos = (category: ExpenseCategory) => category.posVisible !== false
export function expenseCategoryName(category: ExpenseCategory, language = 'id') {
  const index = language.startsWith('zh') ? 0 : language.startsWith('en') ? 1 : 2
  const localized = [category.labelZh, category.labelEn, category.labelId][index]?.trim()
  const label = category.label?.trim()
  return localized || (label && label !== category.key ? label : '') || names[category.key]?.[index] || label || category.labelEn?.trim() || category.labelZh?.trim() || category.labelId?.trim() || category.key
}
