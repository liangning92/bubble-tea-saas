import React, { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export interface OrderItemDisplay {
  productName?: string
  name?: string
  quantity?: number | null
  specName?: string
}

// Every order summary uses the same adjacent product and quantity columns.
export function OrderItemColumns({ before = [], after = [] }: { before?: (number | undefined)[]; after?: (number | undefined)[] }) {
  return <colgroup>{[...before, 280, 72, ...after].map((width, index) => <col key={index} style={width === undefined ? undefined : { width }} />)}</colgroup>
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
    <td data-order-column="product" className="py-3 pr-4 text-sm break-words">{renderProduct ? renderProduct(item) : <span>{item.productName || item.name || '—'}</span>}{item.specName && <p className="text-xs text-gray-500">{item.specName}</p>}</td>
    <td data-order-column="quantity" className="py-3 px-2 text-sm text-left tabular-nums whitespace-nowrap">{item.quantity ?? '—'}</td>
    {index === 0 && trailing?.(rows.length)}
  </tr>)}</>
}

export function OrderItemsTable({ items, amount }: { items?: OrderItemDisplay[]; amount?: (item: OrderItemDisplay, index: number) => ReactNode }) {
  const { t } = useTranslation()
  return <table className="w-full table-fixed text-sm" style={{maxWidth:amount ? 480 : 352}}>
    <colgroup><col /><col style={{width:72}} />{amount && <col style={{width:128}} />}</colgroup>
    <thead><tr className="text-left text-gray-500">
      <th data-order-column="product" className="pb-2 pr-4 font-medium">{t('orderDisplay.product')}</th>
      <th data-order-column="quantity" className="pb-2 px-2 text-left font-medium">{t('orderDisplay.quantity')}</th>
      {amount && <th className="pb-2 pl-6 text-right font-medium">{t('orderDisplay.amount')}</th>}
    </tr></thead><tbody>{items?.length ? items.map((item, index) => <React.Fragment key={index}><OrderItemRows items={[item]} trailing={amount ? () => <td className="py-3 pl-6 text-right whitespace-nowrap">{amount(item,index)}</td> : undefined} /></React.Fragment>) : <OrderItemRows />}</tbody>
  </table>
}
