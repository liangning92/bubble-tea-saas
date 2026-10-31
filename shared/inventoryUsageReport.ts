/** Additive response contract shared by the two inventory reports. */
export interface UsageProduction {
  recipeId: string; name: string; unit: string; theoreticalOutput: number | null;
  registeredOutput: number | null; difference: number | null;
  products?: {productId: string; name: string; theoreticalQuantity: number | null}[]
}
export interface UsageRow {
  inventoryId: string; inventoryName: string; unit: string;
  theoreticalConsumption: number | null; actualConsumption: number | null;
  actualWithdrawal?: number | null; variance: number | null; variancePercent: number | null;
  varianceAmountEstimate?: number | null; varianceStatus: string; unavailableReason?: string | null;
  usableObservationCount?: number; observationCount?: number; completedObservationCount?: number; latestObservationAt?: string | null;
  actualOut?: number|null; expectedClosing?:number|null; closingCountId?:string|null; closingCountItemId?:string|null; closingStatus?:string|null;
  openingPhysical?: number | null; closingPhysical?: number | null; receipts?: number | null;
  knownNonSaleOut?: number | null; windowStart: string; windowEnd: string;
  breakdown?: Record<string, number>; production?: UsageProduction[]; partialPeriod?: boolean; provisional?: boolean
}
export interface UsageResult {
  list: UsageRow[]; hasBusinessActivity?: boolean;
  coverage?: {start: string | null; end: string | null; mixed: boolean};
  segments?: {basis: string; start: string; end: string}[]; legacyOnly?: boolean
}
export interface UsageParams {startDate: string; endDate: string; latest?: boolean}
export function usageCoverage(rows: UsageRow[]) {
  const observed = rows.filter(r => r.observationCount === 2)
  return {start: observed.map(r => r.windowStart).sort()[0] || null,
    end: observed.map(r => r.windowEnd).sort().slice(-1)[0] || null,
    mixed: new Set(observed.map(r => `${r.windowStart}/${r.windowEnd}`)).size > 1}
}
