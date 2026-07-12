export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
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
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    case 'short':
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    case 'time':
      return d.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      })
    default:
      return d.toLocaleDateString('id-ID')
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