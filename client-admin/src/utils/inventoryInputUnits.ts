// Entry units never change the stored material unit.
export type UnitMaterial = { unit: string; packaging?: { unit: string; quantity: number; baseUnit: string } | null };
const aliases: Record<string, string> = { kilogram: 'kg', gram: 'g', liter: 'l', litre: 'l', milliliter: 'ml', millilitre: 'ml' };
const normalize = (unit: string) => aliases[unit.trim().toLowerCase()] || unit.trim().toLowerCase();
export function inventoryInputUnits(material: UnitMaterial): string[] {
  const unit = normalize(material.unit);
  const units = ['kg', 'g'].includes(unit) ? ['kg', 'g'] : ['l', 'ml'].includes(unit) ? ['L', 'ml'] : [material.unit];
  if (material.packaging?.unit) units.push(material.packaging.unit);
  return units.filter((value, index) => units.findIndex(other => normalize(other) === normalize(value)) === index);
}
export function defaultInventoryInputUnit(material: UnitMaterial): string {
  return inventoryInputUnits(material)[0];
}
export function inventoryUnitFactor(material: UnitMaterial, inputUnit: string): number {
  const input = normalize(inputUnit), base = normalize(material.unit);
  if (input === base) return 1;
  const scales: Record<string, [string, number]> = { kg: ['mass', 1000], g: ['mass', 1], l: ['volume', 1000], ml: ['volume', 1] };
  if (scales[input] && scales[base] && scales[input][0] === scales[base][0]) return scales[input][1] / scales[base][1];
  const pack = material.packaging;
  if (pack && normalize(pack.unit) === input && normalize(pack.baseUnit) === base && Number(pack.quantity) > 0) return Number(pack.quantity);
  throw new Error('INCOMPATIBLE_INVENTORY_UNITS');
}
export function inventoryLedgerQuantity(quantity: number, material: UnitMaterial, inputUnit: string): number {
  return Math.round(quantity * inventoryUnitFactor(material, inputUnit) * 1e9) / 1e9;
}
