export type ShiftCashReconciliation = {revenue:number;expenses:number;qris:number;cashFromRevenue:number;openFloat:number;expectedCash:number;windowStart:string;windowEnd:string}
export type ShiftCashWarning = {status:'pending'|'reviewed';expectedCash:number;actualCash:number;difference:number;reviewedAt?:string;reviewedBy?:string;reviewedByName?:string;reviewNote?:string}
export const shiftCashDifference=(actualCash:string,reconciliation?:ShiftCashReconciliation|null) => actualCash.trim()!=='' && Number.isFinite(Number(actualCash)) && reconciliation ? Math.round((Number(actualCash)-reconciliation.expectedCash)*100)/100 : null

export const formatShiftCash=(amount:number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0,maximumFractionDigits:2}).format(amount)
