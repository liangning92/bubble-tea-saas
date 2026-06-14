export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// Format datetime
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Sound feedback using Web Audio API
const audioCtx = typeof window !== 'undefined' ? new (window.AudioContext || (window as any).webkitAudioContext)() : null

export function playSound(type: 'click' | 'success' | 'error' | 'keypress' | 'orderComplete' | 'errorSound' | 'newOrder') {
  if (!audioCtx) return
  const oscillator = audioCtx.createOscillator()
  const gainNode = audioCtx.createGain()
  oscillator.connect(gainNode)
  gainNode.connect(audioCtx.destination)

  switch (type) {
    case 'click':
    case 'keypress':
      oscillator.frequency.value = 800
      gainNode.gain.value = 0.1
      oscillator.start()
      oscillator.stop(audioCtx.currentTime + 0.05)
      break
    case 'success':
    case 'orderComplete':
      oscillator.frequency.value = 880
      gainNode.gain.value = 0.15
      oscillator.start()
      oscillator.stop(audioCtx.currentTime + 0.15)
      break
    case 'error':
    case 'errorSound':
      oscillator.frequency.value = 200
      gainNode.gain.value = 0.2
      oscillator.start()
      oscillator.stop(audioCtx.currentTime + 0.3)
      break
    case 'newOrder':
      oscillator.frequency.value = 660
      gainNode.gain.value = 0.15
      oscillator.start()
      oscillator.stop(audioCtx.currentTime + 0.2)
      break
  }
}

// 带设置的播放函数 - 检查 enabled 和 volume
export function playSoundWithSettings(
  type: 'keypress' | 'orderComplete' | 'error' | 'newOrder',
  settings: { enabled: boolean; volume: number } | undefined
) {
  if (!settings?.enabled) return
  if (!audioCtx) return

  const volume = (settings.volume || 100) / 100 * 0.2 // 归一化到 0-0.2
  const oscillator = audioCtx.createOscillator()
  const gainNode = audioCtx.createGain()
  oscillator.connect(gainNode)
  gainNode.connect(audioCtx.destination)

  switch (type) {
    case 'keypress':
      oscillator.frequency.value = 800
      gainNode.gain.value = volume
      oscillator.start()
      oscillator.stop(audioCtx.currentTime + 0.05)
      break
    case 'orderComplete':
      oscillator.frequency.value = 880
      gainNode.gain.value = volume
      oscillator.start()
      oscillator.stop(audioCtx.currentTime + 0.15)
      break
    case 'error':
      oscillator.frequency.value = 200
      gainNode.gain.value = volume
      oscillator.start()
      oscillator.stop(audioCtx.currentTime + 0.3)
      break
    case 'newOrder':
      oscillator.frequency.value = 660
      gainNode.gain.value = volume
      oscillator.start()
      oscillator.stop(audioCtx.currentTime + 0.2)
      break
  }
}