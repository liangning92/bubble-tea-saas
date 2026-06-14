/**
 * Format number as currency (IDR)
 * @param amount - The amount to format
 * @param locale - Locale for formatting (default: id-ID)
 * @param currency - Currency code (default: IDR)
 */
export function formatCurrency(
  amount: number | string,
  locale: string = 'id-ID',
  currency: string = 'IDR'
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(num)) {
    return 'Rp 0';
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Parse currency string to number
 * @param value - Currency string (e.g., "Rp 15.000")
 */
export function parseCurrency(value: string): number {
  if (!value) return 0;
  // Remove non-numeric characters except decimal point
  const cleaned = value.replace(/[^\d.-]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Format date to locale string
 */
export function formatDate(
  date: Date | string,
  locale: string = 'id-ID',
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, options || {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format time to locale string
 */
export function formatTime(
  date: Date | string,
  locale: string = 'id-ID'
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format date and time together
 */
export function formatDateTime(
  date: Date | string,
  locale: string = 'id-ID'
): string {
  return `${formatDate(date, locale)} ${formatTime(date, locale)}`;
}

/**
 * Generate unique ID
 */
export function generateId(prefix: string = ''): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Clamp number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}