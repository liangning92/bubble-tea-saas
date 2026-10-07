// This endpoint controls preparation only. Payment/refund/cancellation require their own business transactions.
export const preparationTransitions: Readonly<Record<string,readonly string[]>> = {
  preparing:['pending'], ready:['preparing']
}
export function allowedPreviousOrderStatuses(target:string): readonly string[] {
  if (typeof target !== 'string' || !Object.hasOwn(preparationTransitions,target)) throw new Error('ORDER_FINANCIAL_STATUS_PROTECTED')
  const previous=preparationTransitions[target]
  if(!previous) throw new Error('ORDER_FINANCIAL_STATUS_PROTECTED')
  return previous
}
