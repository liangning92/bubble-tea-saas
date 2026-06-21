// Format currency to IDR
export function formatCurrency(amount: number): string {
  if (amount === undefined || amount === null) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// Safe parse date string
function safeParseDate(date: string | Date): Date | null {
  if (!date) return null
  const d = typeof date === 'string' ? new Date(date) : date
  return isNaN(d.getTime()) ? null : d
}

// Format date (handles invalid dates gracefully)
export function formatDate(date: string | Date, fallback = '-'): string {
  const d = safeParseDate(date)
  if (!d) return fallback
  return d.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Format datetime
export function formatDateTime(date: string | Date, fallback = '-'): string {
  const d = safeParseDate(date)
  if (!d) return fallback
  return d.toLocaleString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Format time only
export function formatTime(date: string | Date, fallback = '-'): string {
  const d = safeParseDate(date)
  if (!d) return fallback
  return d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// cn utility
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
