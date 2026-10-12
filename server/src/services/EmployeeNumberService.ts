import { Prisma } from '@prisma/client'

export const EMPLOYEE_NUMBER_PATTERN = /^EMP(?!000)\d{3}$/
export const EMPLOYEE_NUMBER_SEQUENCE_KEY = 'staff.employeeNumber.sequence'
export function formatEmployeeNumber(sequence: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999) throw new Error('EMPLOYEE_NUMBER_CAPACITY_EXCEEDED')
  return `EMP${String(sequence).padStart(3, '0')}`
}

// Call within the same transaction that creates Staff. Updating the singleton
// counter row locks allocation until commit; the saved high-water mark prevents reuse.
export async function allocateEmployeeNumber(tx: Prisma.TransactionClient) {
  if (!process.env.DATABASE_URL?.startsWith('file:')) {
    const rows = await tx.$queryRaw<{ value: number }[]>`SELECT nextval('employee_number_sequence')::int AS value`
    return formatEmployeeNumber(Number(rows[0].value))
  }
  const owner = await tx.store.findFirst({ orderBy: { id: 'asc' }, select: { id: true } })
  if (!owner) throw new Error('EMPLOYEE_NUMBER_STORE_REQUIRED')
  const where = { storeId_key: { storeId: owner.id, key: EMPLOYEE_NUMBER_SEQUENCE_KEY } }
  const counter = await tx.config.upsert({ where,
    create: { storeId: owner.id, key: EMPLOYEE_NUMBER_SEQUENCE_KEY, value: '0', category: 'staff' },
    update: { updatedAt: new Date() }
  })
  const saved = Number(counter.value)
  if (!Number.isSafeInteger(saved) || saved < 0 || saved > 999) throw new Error('EMPLOYEE_NUMBER_COUNTER_INVALID')
  const staff = await tx.staff.findMany({ select: { employeeNumber: true } })
  const maximum = staff.reduce((max, row) => EMPLOYEE_NUMBER_PATTERN.test(row.employeeNumber) ? Math.max(max, Number(row.employeeNumber.slice(3))) : max, saved)
  const next = maximum + 1
  const number = formatEmployeeNumber(next)
  await tx.config.update({ where, data: { value: String(next) } })
  return number
}
