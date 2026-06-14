// Export utilities for CSV/Excel

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

/**
 * Common header translations for exports
 */
export const EXPORT_HEADERS = {
  id: 'ID',
  name: 'Nama',
  phone: 'Telepon',
  email: 'Email',
  address: 'Alamat',
  createdAt: 'Tanggal Dibuat',
  updatedAt: 'Tanggal Diupdate',
  status: 'Status',
  amount: 'Jumlah',
  total: 'Total',
  price: 'Harga',
  quantity: 'Jumlah',
  stock: 'Stok',
  category: 'Kategori',
  description: 'Deskripsi',
  note: 'Catatan',
  reason: 'Alasan',
  date: 'Tanggal',
  startDate: 'Tanggal Mulai',
  endDate: 'Tanggal Selesai',
  orderNumber: 'No. Order',
  customerName: 'Nama Pelanggan',
  staffName: 'Nama Staff',
  supplierName: 'Nama Supplier',
  productName: 'Nama Produk',
  paymentMethod: 'Metode Pembayaran',
  subtotal: 'Subtotal',
  tax: 'Pajak',
  discount: 'Diskon',
  finalAmount: 'Total Akhir',
  paidAmount: 'Jumlah Bayar',
  change: 'Kembalian',
  employeeNumber: 'No. Karyawan',
  position: 'Posisi',
  hireDate: 'Tanggal Masuk',
  salary: 'Gaji',
  leaveType: 'Jenis Cuti',
  leaveBalance: 'Saldo Cuti',
  usedLeave: 'Cuti Terpakai',
  remainingLeave: 'Sisa Cuti'
}