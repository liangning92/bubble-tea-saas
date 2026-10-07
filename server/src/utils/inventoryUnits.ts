/** Persisted quantities and average costs always use the material's existing Inventory.unit. */
export function normalizedUnit(unit: string): string {
 const u=(unit||'').trim().toLowerCase()
 return ({liter:'l',litre:'l',kilogram:'kg',gram:'g',milliliter:'ml',millilitre:'ml',pce:'pcs',piece:'pcs','个':'pcs'} as Record<string,string>)[u]||u
}
export type InventoryPackage={unit:string;quantity:number;baseUnit:string}
export function convertQuantity(quantity:number,from:string,to:string,pack?:InventoryPackage|null):number {
 if(!Number.isFinite(quantity)||quantity<0)throw new Error('INVALID_QUANTITY')
 const source=normalizedUnit(from),target=normalizedUnit(to)
 if(!source||!target)throw new Error('UNIT_REQUIRED')
 let factor=1
 if(source!==target){
  const units:Record<string,[string,number]>={g:['mass',1],kg:['mass',1000],ml:['volume',1],l:['volume',1000]}
  if(units[source]&&units[target]&&units[source][0]===units[target][0])factor=units[source][1]/units[target][1]
  else if(!units[source]&&pack&&source===normalizedUnit(pack.unit)&&target===normalizedUnit(pack.baseUnit)&&Number.isFinite(pack.quantity)&&pack.quantity>0)factor=pack.quantity
  else throw new Error('INCOMPATIBLE_INVENTORY_UNITS')
 }
 const result=quantity*factor
 if(!Number.isFinite(result)||result>1e12)throw new Error('INVALID_QUANTITY')
 return Math.round(result*1e9)/1e9
}
export function validatePackage(pack:InventoryPackage,baseUnit:string){
 if(!pack||typeof pack.unit!=='string'||!pack.unit.trim()||pack.unit.length>30||['g','kg','ml','l'].includes(normalizedUnit(pack.unit))||normalizedUnit(pack.unit)===normalizedUnit(baseUnit)||normalizedUnit(pack.baseUnit)!==normalizedUnit(baseUnit)||!Number.isFinite(pack.quantity)||pack.quantity<=0||pack.quantity>1e9)throw new Error('INVALID_INVENTORY_PACKAGE')
 return {unit:pack.unit.trim(),quantity:pack.quantity,baseUnit}
}
