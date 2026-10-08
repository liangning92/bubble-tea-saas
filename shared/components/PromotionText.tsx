import type { CSSProperties } from 'react'

export interface PromotionTextStyle {
  fontSize?: number
  fontWeight?: 400 | 500 | 700
  textAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'center' | 'bottom'
  lineHeight?: number
}

const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

export function promotionTextCSS(style: PromotionTextStyle = {}, scale = 1): CSSProperties {
  return {
    fontSize: bounded(style.fontSize, 32, 12, 96) * scale,
    fontWeight: [400, 500, 700].includes(style.fontWeight || 0) ? style.fontWeight : 700,
    textAlign: ['left', 'center', 'right'].includes(style.textAlign || '') ? style.textAlign : 'center',
    lineHeight: bounded(style.lineHeight, 1.5, 1, 3),
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  }
}

export function PromotionText({ lines, style = {}, scale = 1 }: {
  lines: string[]
  style?: PromotionTextStyle
  scale?: number
}) {
  const justifyContent = style.verticalAlign === 'top' ? 'flex-start' : style.verticalAlign === 'bottom' ? 'flex-end' : 'center'
  return (
    <div className="w-full h-full flex flex-col overflow-y-auto p-4" style={{ justifyContent }}>
      <div className="w-full shrink-0 my-auto" style={{ ...promotionTextCSS(style, scale), marginTop: style.verticalAlign === 'top' ? 0 : undefined, marginBottom: style.verticalAlign === 'bottom' ? 0 : undefined }}>
        {lines.join('\n')}
      </div>
    </div>
  )
}
