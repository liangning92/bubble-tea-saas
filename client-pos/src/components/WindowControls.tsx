import { useState, useEffect } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'

interface WindowControlsProps {
  variant?: 'header' | 'dark'
  className?: string
}

export function WindowControls({ variant = 'header', className = '' }: WindowControlsProps) {
  const [isMax, setIsMax] = useState(false)
  const [hasElectron, setHasElectron] = useState(false)

  useEffect(() => {
    const api = (window as any).electronAPI
    if (api?.minimizeWindow) {
      setHasElectron(true)
      api.isMaximized?.().then((max: boolean) => setIsMax(!!max)).catch(() => {})
    }
  }, [])

  // In non-Electron web browsers, don't show native window controls
  if (!hasElectron) {
    return null
  }

  const handleMinimize = () => {
    const api = (window as any).electronAPI
    api?.minimizeWindow?.()
  }

  const handleMaximize = async () => {
    const api = (window as any).electronAPI
    if (api?.maximizeWindow) {
      const res = await api.maximizeWindow()
      setIsMax(!!res)
    }
  }

  const handleClose = () => {
    const api = (window as any).electronAPI
    api?.closeWindow?.()
  }

  const isHeader = variant === 'header'

  const btnBase = 'h-8 px-3 flex items-center justify-center transition-colors select-none'
  const normalBtnClass = isHeader
    ? `${btnBase} text-white/90 hover:bg-white/20 hover:text-white`
    : `${btnBase} text-gray-600 hover:bg-gray-200 hover:text-gray-900`

  const closeBtnClass = isHeader
    ? `${btnBase} text-white/90 hover:bg-[#E81123] hover:text-white`
    : `${btnBase} text-gray-600 hover:bg-[#E81123] hover:text-white`

  return (
    <div className={`flex items-center no-drag ${className}`} style={{ WebkitAppRegion: 'no-drag' } as any}>
      {/* Minimize */}
      <button
        onClick={handleMinimize}
        className={normalBtnClass}
        title="Minimize"
        aria-label="Minimize window"
      >
        <Minus size={14} strokeWidth={2} />
      </button>

      {/* Maximize / Restore */}
      <button
        onClick={handleMaximize}
        className={normalBtnClass}
        title={isMax ? 'Restore' : 'Maximize'}
        aria-label="Maximize or restore window"
      >
        {isMax ? (
          <Copy size={12} strokeWidth={2} className="rotate-90" />
        ) : (
          <Square size={12} strokeWidth={2} />
        )}
      </button>

      {/* Close */}
      <button
        onClick={handleClose}
        className={closeBtnClass}
        title="Close"
        aria-label="Close window"
      >
        <X size={15} strokeWidth={2} />
      </button>
    </div>
  )
}
