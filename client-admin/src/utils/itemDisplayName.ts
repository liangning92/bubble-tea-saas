import { formatNumber } from './numberDisplay'
export { itemDisplayName } from '../../../shared/utils/localizedItemName'

export function formatDisplayQuantity(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return formatNumber(value)
}
