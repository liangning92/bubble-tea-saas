import { useTranslation } from 'react-i18next'
/** Display precision never changes the paid total or the cost used by a recipe. */
export function PurchasePrices({quantity,paidAmount,ledgerQuantity,unit,ledgerUnit}:{quantity:number;paidAmount:number;ledgerQuantity:number;unit:string;ledgerUnit:string}){
 const {t,i18n}=useTranslation()
 if(!(quantity>0&&ledgerQuantity>0&&Number.isFinite(paidAmount)))return null
 const format=(v:number)=>v.toLocaleString(i18n.language,{maximumFractionDigits:6})
 const normalize=(u:string)=>(({gram:'g',kilogram:'kg',liter:'l',litre:'l',milliliter:'ml'} as Record<string,string>)[u.toLowerCase()]||u.toLowerCase())
 const base=normalize(ledgerUnit),selected=normalize(unit),cost=paidAmount/ledgerQuantity
 const prices=[{unit,value:paidAmount/quantity}]
 const equivalents=base==='g'?[{unit:'kg',value:cost*1000},{unit:'g',value:cost}]:base==='kg'?[{unit:'kg',value:cost},{unit:'g',value:cost/1000}]:base==='ml'?[{unit:'L',value:cost*1000},{unit:'ml',value:cost}]:base==='l'?[{unit:'L',value:cost},{unit:'ml',value:cost/1000}]:[{unit:ledgerUnit,value:cost}]
 prices.push(...equivalents.filter(p=>normalize(p.unit)!==selected))
 return <div className="text-sm text-gray-600 space-y-1">{prices.map(p=><p key={p.unit}>{t('entryFix.unitPrice')}: Rp {format(p.value)} / {p.unit}</p>)}{selected!==base&&<p className="text-xs text-gray-400">{t('inventoryFlow.converted')}: {format(ledgerQuantity)} {ledgerUnit}</p>}</div>
}
