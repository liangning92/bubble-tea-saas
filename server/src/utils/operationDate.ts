import { z } from 'zod'
import { parseBusinessDate } from './businessDate'
export const jakartaDay = (date = new Date()) => new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10)
export function operationDate(value?: string): Date | undefined {
  if (value === undefined) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_OPERATION_DATE')
  parseBusinessDate(value)
  if (value > jakartaDay()) throw new Error('FUTURE_OPERATION_DATE')
  // Portable DateTime columns encode a calendar day at UTC midnight, never host local time.
  return new Date(value + 'T00:00:00Z')
}
export const operationDateSchema = z.string().refine(value => { try { operationDate(value); return true } catch { return false } }, 'INVALID_OPERATION_DATE')
