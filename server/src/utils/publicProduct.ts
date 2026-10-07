// Enforce server-side cost/recipe boundaries for ordinary POS and staff readers.
const privateFields=new Set(['costPrice','avgCost','bomItems','bomCost','costPerUnit','totalCost','processRecipe','processRecipeId'])
export function publicProduct(value:any,role:string):any {
 if(role==='admin'||role==='manager')return value
 if(Array.isArray(value))return value.map(item=>publicProduct(item,role))
 if(value instanceof Date||value===null||typeof value!=='object')return value
 return Object.fromEntries(Object.entries(value).filter(([key])=>!privateFields.has(key)).map(([key,item])=>[key,publicProduct(item,role)]))
}
