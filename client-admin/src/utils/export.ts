// Export utilities for CSV/Excel

/**
 * i18n key names for export headers.
 * Use getExportHeaders(t) in React components to get translated versions.
 */
export const EXPORT_HEADER_KEYS = {
  id: 'exportHeaders.id',
  name: 'exportHeaders.name',
  phone: 'exportHeaders.phone',
  email: 'exportHeaders.email',
  address: 'exportHeaders.address',
  createdAt: 'exportHeaders.createdAt',
  updatedAt: 'exportHeaders.updatedAt',
  status: 'exportHeaders.status',
  amount: 'exportHeaders.amount',
  total: 'exportHeaders.total',
  price: 'exportHeaders.price',
  quantity: 'exportHeaders.quantity',
  stock: 'exportHeaders.stock',
  category: 'exportHeaders.category',
  description: 'exportHeaders.description',
  note: 'exportHeaders.note',
  reason: 'exportHeaders.reason',
  date: 'exportHeaders.date',
  startDate: 'exportHeaders.startDate',
  endDate: 'exportHeaders.endDate',
  orderNumber: 'exportHeaders.orderNumber',
  customerName: 'exportHeaders.customerName',
  staffName: 'exportHeaders.staffName',
  supplierName: 'exportHeaders.supplierName',
  productName: 'exportHeaders.productName',
  paymentMethod: 'exportHeaders.paymentMethod',
  subtotal: 'exportHeaders.subtotal',
  tax: 'exportHeaders.tax',
  discount: 'exportHeaders.discount',
  finalAmount: 'exportHeaders.finalAmount',
  paidAmount: 'exportHeaders.paidAmount',
  change: 'exportHeaders.change',
  employeeNumber: 'exportHeaders.employeeNumber',
  position: 'exportHeaders.position',
  hireDate: 'exportHeaders.hireDate',
  salary: 'exportHeaders.salary',
  leaveType: 'exportHeaders.leaveType',
  leaveBalance: 'exportHeaders.leaveBalance',
  usedLeave: 'exportHeaders.usedLeave',
  remainingLeave: 'exportHeaders.remainingLeave'
} as const

/**
 * Get export headers translated via the given t() function.
 * Call this inside a React component that has useTranslation().
 */
export function getExportHeaders(t: (key: string) => string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(EXPORT_HEADER_KEYS)) {
    result[k] = t(v)
  }
  return result
}

/**
 * Convert array of objects to CSV string
 */
export function convertToCSV<T extends Record<string, any>>(
  data: T[],
  headers?: Record<string, string>
): string {
  if (data.length === 0) return ''

  const keys = Object.keys(data[0])
  const headerRow = keys.map(key => headers?.[key] || key).join(',')

  const dataRows = data.map(row =>
    keys.map(key => {
      const value = row[key]
      // Handle strings with commas or quotes
      if (typeof value === 'string') {
        const escaped = value.replace(/"/g, '""')
        return `"${escaped}"`
      }
      if (value instanceof Date) {
        return value.toISOString().split('T')[0]
      }
      return value ?? ''
    }).join(',')
  )

  return [headerRow, ...dataRows].join('\n')
}

/**
 * Download data as CSV file
 */
export function downloadCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  headers?: Record<string, string>
) {
  const csv = convertToCSV(data, headers)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Format currency for export
 */
export function formatCurrencyForExport(amount: number, currency = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0
  }).format(amount)
}

/**
 * Format date for export
 */
export function formatDateForExport(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

/**
 * Format datetime for export
 */
export function formatDateTimeForExport(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
