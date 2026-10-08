export interface CustomerDisplayLogoStyle {
  horizontalAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'center' | 'bottom'
  sizePercent?: number
}

export function CustomerDisplayLogo({ src, fallback, style = {}, background = '#EC6D88' }: {
  src: string
  fallback: string
  style?: CustomerDisplayLogoStyle
  background?: string
}) {
  const size = typeof style.sizePercent === 'number' && Number.isFinite(style.sizePercent) ? Math.min(100, Math.max(10, style.sizePercent)) : 70
  return (
    <div className="w-full h-full flex flex-col p-4" style={{
      background,
      alignItems: style.horizontalAlign === 'left' ? 'flex-start' : style.horizontalAlign === 'right' ? 'flex-end' : 'center',
      justifyContent: style.verticalAlign === 'top' ? 'flex-start' : style.verticalAlign === 'bottom' ? 'flex-end' : 'center',
    }}>
      <img src={src || fallback} alt="Logo" style={{ width: `${size}%`, maxHeight: '100%', objectFit: 'contain' }} onError={e => {
        if (e.currentTarget.getAttribute('src') !== fallback) e.currentTarget.src = fallback
      }} />
    </div>
  )
}
