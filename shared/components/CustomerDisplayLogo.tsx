import React from 'react'
export interface CustomerDisplayLogoStyle {
  horizontalAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'center' | 'bottom'
  variant?: 'auto' | 'red' | 'white' | 'black' | 'custom'
  sizePercent?: number
}

export function CustomerDisplayLogo({ src, fallback, whiteFallback, style = {}, background = '#EC6D88' }: {
  src: string
  fallback: string
  whiteFallback: string
  style?: CustomerDisplayLogoStyle
  background?: string
}): React.ReactElement {
  const size = typeof style.sizePercent === 'number' && Number.isFinite(style.sizePercent) ? Math.min(100, Math.max(10, style.sizePercent)) : 70
  const variant = style.variant || 'auto'
  const rgb = [1, 3, 5].map(i => parseInt(background.slice(i, i + 2), 16))
  const light = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 180
  const brandSource = variant === 'white' || (variant === 'auto' && !light) ? whiteFallback : fallback
  const source = variant === 'custom' ? src || brandSource : brandSource
  return (
    <div className="w-full h-full flex flex-col p-4" style={{
      background,
      alignItems: style.horizontalAlign === 'left' ? 'flex-start' : style.horizontalAlign === 'right' ? 'flex-end' : 'center',
      justifyContent: style.verticalAlign === 'top' ? 'flex-start' : style.verticalAlign === 'bottom' ? 'flex-end' : 'center',
    }}>
      <img src={source} alt="Logo" style={{ width: `${size}%`, maxHeight: '100%', minHeight: 0, flexShrink: 1, objectFit: 'contain', filter: variant === 'black' ? 'brightness(0)' : undefined }} onError={e => {
        if (e.currentTarget.getAttribute('src') !== brandSource) e.currentTarget.src = brandSource
      }} />
    </div>
  )
}
