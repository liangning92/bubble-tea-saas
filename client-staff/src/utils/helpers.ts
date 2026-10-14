// Presentation only: never round quantities sent to the inventory ledger.
export function formatQuantity(value: number | null | undefined, language = 'id'): string {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat(language.startsWith('zh') ? 'zh-CN' : language.startsWith('en') ? 'en-US' : 'id-ID', { maximumFractionDigits: Math.abs(Number(value)) > 0 && Math.abs(Number(value)) < 0.000001 ? 12 : 6 }).format(Number(value))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

export function formatMinorCurrency(amount: number): string {
  return formatCurrency(amount / 100)
}

export function formatCurrencyByLang(amount: number, lang: string = 'id'): string {
  const localeMap: Record<string, string> = {
    'id': 'id-ID',
    'en': 'en-US',
    'zh': 'zh-CN'
  }
  return new Intl.NumberFormat(localeMap[lang] || 'id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

export function formatDate(date: Date | string, format: string = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date

  switch (format) {
    case 'long':
      return d.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    case 'short':
      return d.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    case 'time':
      return d.toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit'
      })
    default:
      return d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })
  }
}

export function getTimeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (minutes < 60) return `${minutes} menit lalu`
  if (hours < 24) return `${hours} jam lalu`
  return `${days} hari lalu`
}