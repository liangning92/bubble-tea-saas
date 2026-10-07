export type PaymentProblem = 'configuration' | 'method' | 'minimum' | 'cashRequired' | 'cashInvalid' | 'cashShort' | 'cashLimit' | 'changeDisabled' | 'external'
export function paymentProblem(input: {ready:boolean; enabled:boolean; method:string; total:number; paid:string; minAmount:number; maxCashAmount:number; changeEnabled:boolean;externalConfirmed?:boolean}): PaymentProblem | null {
  if (!input.ready) return 'configuration'
  if (!input.enabled) return 'method'
  if (!Number.isSafeInteger(input.total) || input.total < 0) return 'cashInvalid'
  if (input.minAmount > 0 && input.total < input.minAmount) return 'minimum'
  if (input.method !== 'cash') return input.method === 'qris' || input.externalConfirmed === true ? null : 'external'
  if (!input.paid.trim()) return 'cashRequired'
  if (!/^\d+$/.test(input.paid.trim()) || !Number.isSafeInteger(Number(input.paid))) return 'cashInvalid'
  const paid = Number(input.paid)
  if (paid < input.total) return 'cashShort'
  if (input.maxCashAmount > 0 && paid > input.maxCashAmount) return 'cashLimit'
  if (!input.changeEnabled && paid !== input.total) return 'changeDisabled'
  return null
}
