import prisma from '../config/database'
import { InsightFilters, insightPeriod, summarizeProducts, productPreferences, productQuadrants } from '../utils/productInsights'
export async function getInsights(storeId:string,filters:InsightFilters,options:{detail?:boolean;productId?:string;page?:number;search?:string;sort?:string;direction?:string}={}) {
  const store=await prisma.store.findUniqueOrThrow({where:{id:storeId},select:{timezone:true}})
  const period=insightPeriod(filters.days,store.timezone)
  const where={storeId,status:{in:['completed','paid','refunded']},...(filters.channelId?{channelId:filters.channelId}:{})}
  const include={items:{include:{product:{include:{category:true}}}},channel:true,refundRequests:{where:{status:{in:['approved','paid']}}}}
  const [current,previous,catalog]=await Promise.all([
    prisma.order.findMany({where:{...where,createdAt:{gte:period.start,lte:period.end}},include}),
    options.productId?Promise.resolve([]):prisma.order.findMany({where:{...where,createdAt:{gte:period.previousStart,lt:period.previousEnd}},include}),
    prisma.product.findMany({where:{storeId,deletedAt:null},include:{category:true}})
  ])
  if(options.productId){if(!catalog.some(p=>p.id===options.productId))throw Error('PRODUCT_NOT_FOUND');return {...productPreferences(current,options.productId),period}}
  const now=summarizeProducts(current,catalog,filters),before=summarizeProducts(previous,catalog,filters)
  const prior=new Map(before.list.map(r=>[r.productId,r.quantity]))
  const list=now.list.map(r=>({...r,previousQuantity:prior.get(r.productId)||0,change:(prior.get(r.productId)||0)>0?(r.quantity-(prior.get(r.productId)||0))/(prior.get(r.productId)||1)*100:null}))
  if(options.detail) {
    const filtered=list.filter(r=>!options.search||r.productName.toLowerCase().includes(options.search.toLowerCase()))
    const sort=['quantity','penetration','change','revenue'].includes(options.sort||'')?options.sort!:'quantity'
    filtered.sort((a,b)=>((a[sort]??-Infinity)-(b[sort]??-Infinity))*(options.direction==='asc'?1:-1)||a.productId.localeCompare(b.productId))
    const page=Math.max(1,options.page||1)
    return {list:filtered.slice((page-1)*20,page*20),total:filtered.length,page,pageSize:20}
  }
  const matrix=list.filter(r=>r.quantity>0).map(({productId,productName,quantity,margin,matrixType})=>({productId,productName,quantity,margin,matrixType}))
  const strategies=productQuadrants(matrix)
  const quadrantMatrix=strategies.flatMap(s=>s.products)
  return {period,overview:now.overview,categories:now.categories,top:list.filter(r=>r.quantity>0).slice(0,10),revenueTop:[...list].filter(r=>r.quantity>0).sort((a,b)=>b.revenue-a.revenue).slice(0,10),profitTop:[...list].filter(r=>r.quantity>0&&r.grossProfit!==null).sort((a,b)=>b.grossProfit-a.grossProfit||a.productId.localeCompare(b.productId)).slice(0,10),matrix:quadrantMatrix,benchmarks:now.benchmarks,strategies,changes:[...list].filter(r=>r.quantity>0||r.previousQuantity>0).sort((a,b)=>Math.abs(b.quantity-b.previousQuantity)-Math.abs(a.quantity-a.previousQuantity)).slice(0,10),channels:now.channels.slice(0,20),pairs:now.pairs,products:catalog.filter(p=>!filters.categoryId||p.categoryId===filters.categoryId).map(p=>({id:p.id,name:p.name}))}
}
