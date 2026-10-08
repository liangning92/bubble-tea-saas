import React from 'react'

export type CustomerContent = 'media' | 'promotions' | 'welcome' | 'order' | 'logo'
export interface CustomerLayoutRow { height: number; content: CustomerContent }
export interface CustomerLayoutColumn { width: number; content: CustomerContent; rows?: CustomerLayoutRow[] }

export const BRAND_BACKGROUND = '#EC6D88'
export function customerBackground(value?: string) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : BRAND_BACKGROUND
}
export function customerTextColor(background: string) {
  const rgb = [1, 3, 5].map(i => parseInt(background.slice(i, i + 2), 16))
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 180 ? '#1F2937' : '#FFFFFF'
}
export function customerRows(column: CustomerLayoutColumn): CustomerLayoutRow[] {
  return column.rows?.length ? column.rows : [{ height: 100, content: column.content }]
}
export function equalPercents(count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.floor(100 / count) + (i < 100 % count ? 1 : 0))
}
const weight = (value: number) => Number.isFinite(value) && value > 0 ? value : 1

export function CustomerDisplayLayout({ columns, renderContent, background }: {
  columns: CustomerLayoutColumn[]
  renderContent: (content: CustomerContent) => React.ReactNode
  background: string
}) {
  const total = columns.reduce((sum, col) => sum + weight(col.width), 0)
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background }}>
      {columns.map((col, index) => {
        const rows = customerRows(col)
        const heightTotal = rows.reduce((sum, row) => sum + weight(row.height), 0)
        return (
          <div key={index} style={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: `${weight(col.width) / total * 100}%`, height: '100%', overflow: 'hidden' }}>
            {rows.map((row, rowIndex) => (
              <div key={rowIndex} style={{ height: `${weight(row.height) / heightTotal * 100}%`, minHeight: 0, width: '100%', overflow: 'hidden', flexShrink: 0 }}>
                {renderContent(row.content)}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
