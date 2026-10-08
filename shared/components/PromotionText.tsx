import React from 'react'

export interface PromotionTextStyle {
  fontSize?: number
  fontWeight?: 400 | 500 | 700
  textAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'center' | 'bottom'
  lineHeight?: number
}

const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

export function promotionTextCSS(style: PromotionTextStyle = {}, scale = 1): React.CSSProperties {
  return {
    fontSize: bounded(style.fontSize, 32, 12, 96) * scale,
    fontWeight: [400, 500, 700].includes(style.fontWeight || 0) ? style.fontWeight : 700,
    textAlign: ['left', 'center', 'right'].includes(style.textAlign || '') ? style.textAlign : 'center',
    lineHeight: bounded(style.lineHeight, 1.5, 1, 3),
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  }
}

export function PromotionText({ lines, style = {}, subtitleStyle, scale = 1 }: {
  lines: string[]
  style?: PromotionTextStyle
  subtitleStyle?: PromotionTextStyle
  scale?: number
}) {
  const justifyContent = style.verticalAlign === 'top' ? 'flex-start' : style.verticalAlign === 'bottom' ? 'flex-end' : 'center'
  return (
    <div className="w-full h-full flex flex-col overflow-y-auto p-4" style={{ justifyContent }}>
      <div className="w-full shrink-0 my-auto" style={{ marginTop: style.verticalAlign === 'top' ? 0 : undefined, marginBottom: style.verticalAlign === 'bottom' ? 0 : undefined }}>
        <div style={promotionTextCSS(style, scale)}>{lines[0] || ''}</div>
        {lines.length > 1 && <div className="mt-2" style={promotionTextCSS({ fontSize: 20, fontWeight: 400, ...subtitleStyle, textAlign: style.textAlign }, scale)}>{lines.slice(1).join('\n')}</div>}
      </div>
    </div>
  )
}
