import React, { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export interface OrderItemDisplay {
  productName?: string
  name?: string
  quantity?: number | null
  specName?: string
}

// A real table row per item keeps quantities aligned even when names wrap.
export function OrderItemRows({ items, leading, trailing, onClick, renderProduct }: {
  items?: OrderItemDisplay[]
  leading?: (rowSpan: number) => ReactNode
  trailing?: (rowSpan: number) => ReactNode
  renderProduct?: (item: OrderItemDisplay) => ReactNode
  onClick?: () => void
}) {
  const rows = items?.length ? items : [{}]
  return <>{rows.map((item, index) => <tr key={index} onClick={onClick} className={`${index === 0 ? 'border-t' : ''} ${onClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
    {index === 0 && leading?.(rows.length)}
    <td className="py-3 pr-4 text-sm max-w-sm break-words">{renderProduct ? renderProduct(item) : <span>{item.productName || item.name || '—'}</span>}{item.specName && <p className="text-xs text-gray-500">{item.specName}</p>}</td>
    <td className="py-3 px-4 text-sm text-right tabular-nums whitespace-nowrap">{item.quantity ?? '—'}</td>
    {index === 0 && trailing?.(rows.length)}
  </tr>)}</>
}

export function OrderItemsTable({ items, amount }: { items?: OrderItemDisplay[]; amount?: (item: OrderItemDisplay, index: number) => ReactNode }) {
  const { t } = useTranslation()
  return <table className="w-full text-sm"><thead><tr className="text-left text-gray-500">
    <th className="pb-2 pr-4 font-medium">{t('orderDisplay.product')}</th>
    <th className="pb-2 px-4 text-right font-medium">{t('orderDisplay.quantity')}</th>
    {amount && <th className="pb-2 text-right font-medium">{t('orderDisplay.amount')}</th>}
  </tr></thead><tbody>{items?.length ? items.map((item, index) => <React.Fragment key={index}><OrderItemRows items={[item]} trailing={amount ? () => <td className="py-3 text-right whitespace-nowrap">{amount(item,index)}</td> : undefined} /></React.Fragment>) : <OrderItemRows />}</tbody></table>
}
