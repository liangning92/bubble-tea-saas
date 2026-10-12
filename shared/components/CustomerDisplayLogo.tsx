import React from 'react'
export interface CustomerDisplayLogoStyle {
  horizontalAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'center' | 'bottom'
  variant?: 'auto' | 'red' | 'white' | 'black' | 'custom'
  sources?: Partial<Record<'red' | 'white' | 'black' | 'custom', string>>
  sizePercent?: number
}

export function customerDisplayLogoColor(style: CustomerDisplayLogoStyle = {}, background = '#EC6D88'): 'red' | 'white' | 'black' | 'custom' {
  if (style.variant && style.variant !== 'auto') return style.variant
  const rgb = [1, 3, 5].map(i => parseInt(background.slice(i, i + 2), 16))
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 180 ? 'red' : 'white'
}

export function CustomerDisplayLogo({ fallback, whiteFallback, style = {}, background = '#EC6D88' }: {
  fallback: string
  whiteFallback: string
  style?: CustomerDisplayLogoStyle
  background?: string
}): React.ReactElement {
  const size = typeof style.sizePercent === 'number' && Number.isFinite(style.sizePercent) ? Math.min(100, Math.max(10, style.sizePercent)) : 70
  const variant = style.variant || 'auto'
  const color = customerDisplayLogoColor(style, background)
  const brandSource = color === 'white' ? whiteFallback : fallback
  const source = style.sources?.[color] || brandSource
  return (
    <div className="w-full h-full flex flex-col p-4" style={{
      background,
      alignItems: style.horizontalAlign === 'left' ? 'flex-start' : style.horizontalAlign === 'right' ? 'flex-end' : 'center',
      justifyContent: style.verticalAlign === 'top' ? 'flex-start' : style.verticalAlign === 'bottom' ? 'flex-end' : 'center',
    }}>
      <img src={source} alt="Logo" style={{ width: `${size}%`, maxHeight: '100%', minHeight: 0, flexShrink: 1, objectFit: 'contain', filter: variant === 'black' ? 'brightness(0)' : undefined }} onError={e => {
        // An explicitly selected image must never silently become a different logo.
        if (!style.sources?.[color] && e.currentTarget.getAttribute('src') !== brandSource) e.currentTarget.src = brandSource
      }} />
    </div>
  )
}
