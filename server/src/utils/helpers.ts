// Format currency to IDR
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// Parse currency string to number (in cents)
export function parseCurrency(amount: string | number): number {
  if (typeof amount === 'number') return amount
  const cleaned = amount.replace(/[^\d.-]/g, '')
  return Math.round(parseFloat(cleaned))
}

// Format date to ISO
export function formatDate(date: Date, locale: string = 'id-ID'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

// Format time to locale string
export function formatTime(date: Date, locale: string = 'id-ID'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

// Format datetime to locale string
export function formatDateTime(date: Date, locale: string = 'id-ID'): string {
  return `${formatDate(date, locale)} ${formatTime(date, locale)}`
}

// Get start and end of day
export function getDayRange(date: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

// Get start and end of month
export function getMonthRange(date: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

// Generate order number
export function generateOrderNumber(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `${dateStr}-${random}`
}

// Generate employee number
export function generateEmployeeNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.random().toString().substring(2, 6)
  return `EMP${year}${random}`
}

// Validate phone number (Indonesian format)
export function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/[^\d]/g, '')
  return cleaned.length >= 10 && cleaned.length <= 15
}

// Format phone number for display
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[^\d]/g, '')
  if (cleaned.startsWith('0')) {
    return `+62 ${cleaned.slice(1)}`
  }
  return phone
}

// Calculate PPN (Indonesian tax)
export function calculatePPN(amount: number, rate: number = 0.11): number {
  return Math.round(amount * rate)
}

// Calculate total with PPN
export function calculateTotalWithTax(amount: number, taxRate: number = 0.11): {
  subtotal: number
  tax: number
  total: number
} {
  const tax = calculatePPN(amount, taxRate)
  return {
    subtotal: amount,
    tax,
    total: amount + tax
  }
}

// Pagination helper
export function paginate(page: number, pageSize: number) {
  const skip = (page - 1) * pageSize
  return { skip, take: pageSize }
}

// Response wrapper
export function successResponse<T>(data: T, message: string = 'Success') {
  return {
    code: 200,
    message,
    data,
    timestamp: new Date().toISOString()
  }
}

export function createdResponse<T>(data: T, message: string = 'Created') {
  return {
    code: 201,
    message,
    data,
    timestamp: new Date().toISOString()
  }
}

// Calculate percentage
export function percentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100 * 100) / 100
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}