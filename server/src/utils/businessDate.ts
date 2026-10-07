import { z } from 'zod'
import { formatDate, endOfDay } from './dateUtils'

export class BusinessInputError extends Error {}

export function parseBusinessDate(value: unknown): Date {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00+07:00`)
    if (Number.isFinite(date.getTime()) && formatDate(date) === value) return date
  } else if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value)
  } else if (typeof value === 'string' && z.string().datetime({ offset: true }).safeParse(value).success) {
    return new Date(value)
  }
  throw new BusinessInputError('Invalid calendar date')
}

export function parseDateBoundary(value: string, end = false): Date {
  const date = parseBusinessDate(value)
  return end && /^\d{4}-\d{2}-\d{2}$/.test(value) ? endOfDay(date) : date
}
