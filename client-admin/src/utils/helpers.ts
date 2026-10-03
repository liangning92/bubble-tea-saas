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

/**
 * Normalize inventory quantity and unit for display.
 * Converts kg→g (×1000) and L→ml (×1000) for consistent display.
 * Returns { quantity, unit } where unit is always g/ml/个/etc (not kg/L).
 */
export function normalizeInventoryUnit(quantity: number, unit: string): { quantity: number; unit: string } {
  const u = (unit || '').toLowerCase()
  if (u === 'kg') {
    return { quantity: quantity * 1000, unit: 'g' }
  }
  if (u === 'l') {
    return { quantity: quantity * 1000, unit: 'ml' }
  }
  return { quantity, unit }
}

/**
 * Format inventory stock with normalized unit for display.
 * Shows kg→g and L→ml conversion in the display value.
 */
export function formatStockDisplay(quantity: number, unit: string): string {
  const normalized = normalizeInventoryUnit(quantity, unit)
  const qty = Math.round(normalized.quantity * 100) / 100
  return `${qty} ${normalized.unit}`
}

/**
 * Get normalized unit string (converts kg→g, L→ml).
 * Does NOT convert the quantity - use normalizeInventoryUnit for that.
 */
export function normalizeUnit(unit: string): string {
  const u = (unit || '').toLowerCase()
  if (u === 'kg') return 'g'
  if (u === 'l') return 'ml'
  return unit
}

/**
 * Format inventory or material name based on current language.
 * When language is 'id' or 'en', strips out Chinese text in parentheses like " (小吸管/细吸管)".
 */
export function formatItemName(name: string, lang: string = 'id'): string {
  if (!name) return '-'
  if (lang === 'zh') return name
  return name.replace(/\s*\([^\)]*[\u4e00-\u9fff]+[^\)]*\)/g, '').trim()
}

