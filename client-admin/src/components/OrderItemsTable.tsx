import type { ComponentProps } from 'react'
import { OrderItemRows as SharedRows, OrderItemsTable as SharedTable } from '../../../shared/components/OrderItemsTable'
import { formatNumber } from '../utils/numberDisplay'
export { OrderItemColumns } from '../../../shared/components/OrderItemsTable'
export type { OrderItemDisplay } from '../../../shared/components/OrderItemsTable'
export function OrderItemRows(props: ComponentProps<typeof SharedRows>) { return <SharedRows {...props} formatQuantity={formatNumber} /> }
export function OrderItemsTable(props: ComponentProps<typeof SharedTable>) { return <SharedTable {...props} formatQuantity={formatNumber} /> }
