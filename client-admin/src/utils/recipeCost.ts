export interface RecipeCostRow {
  inventoryId: string
  quantityStr: string
  rowTotal?: number | null
  cost: number | null
  costPending?: boolean
  costFailed?: boolean
  costBreakdown?: { cost?: number; breakdown?: unknown }
}

export function finiteCost(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

export function recipeRowCost(row: RecipeCostRow): number | null {
  if (!row.inventoryId) return 0
  if (row.costPending || row.costFailed) return null
  const quantity = Number(row.quantityStr)
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  if (row.rowTotal !== undefined) return finiteCost(row.rowTotal)
  if (row.costBreakdown?.cost !== undefined) return finiteCost(row.costBreakdown.cost)
  const unitCost = finiteCost(row.cost)
  return unitCost === null ? null : finiteCost(quantity * unitCost)
}

export function recipeTotalCost(rows: RecipeCostRow[]): number | null {
  let sum = 0
  for (const row of rows) {
    const cost = recipeRowCost(row)
    if (cost === null) return null
    sum += cost
  }
  return Number.isFinite(sum) ? sum : null
}
