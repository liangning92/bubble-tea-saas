import { TeamError } from '../TeamCommunicationService'
/** Orders use rupiah; native Expense.amount uses cents. Never guess the model's unit. */
export function expenseIdrToCents(amount: unknown, unit: unknown) {
  if (
    unit !== 'IDR' ||
    typeof amount !== 'number' ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(amount * 100) ||
    amount * 100 > 2147483647
  )
    throw new TeamError(400, 'EMPLOYEE_EXPENSE_AMOUNT_OR_UNIT_REQUIRED')
  return amount * 100
}
export function expenseCentsToIdr(amount: number) {
  return amount / 100
}
