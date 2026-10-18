// Packaging is issued in batches; daily withdrawals cannot establish daily loss.
// Only plain store-made water/ice are free supplies, never tea/syrup/ice cream.
export function inventoryUsageMode(item:{category?:string;name?:string}):'tracked'|'bulk'|'self_produced' {
 const parts=(item.name||'').split(/[\/()（）]/).map(s=>s.trim().toLowerCase())
 if(parts.some(p=>['制备冲泡热水','食用冰块','hot water','air panas','ice cube','ice cubes','es batu'].includes(p)))return 'self_produced'
 return item.category==='packaging'?'bulk':'tracked'
}
