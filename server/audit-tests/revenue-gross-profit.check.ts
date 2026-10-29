import test from 'node:test'
import assert from 'node:assert/strict'
import { revenueQuery, revenueQueryOptions } from '../src/services/RevenueQueryService'
import { summarizeProducts } from '../src/utils/productInsights'
const now=new Date('2026-10-29T05:00:00Z')
const product={id:'tea',name:'Tea',categoryId:'tea',category:{name:'Tea'}}
function order(extra:any={}) {return {id:'o1',storeId:'store',orderNumber:'001',createdAt:now,status:'paid',totalAmount:1000,discountAmount:100,finalAmount:990,checkoutTaxAmount:90,requestFingerprint:'v1:test',paymentMethod:'cash',channelId:null,channel:null,refundRequests:[],items:[{id:'line',productId:'tea',product,productName:'Tea',quantity:2,unitPrice:500,bomCost:200,addons:'[]'}],...extra}}
function dbFor(orders:any[]) {
 const reads:any[]=[]
 const db:any={config:{findUnique:async()=>null,findMany:async()=>[]},channel:{findMany:async()=>[]},expense:{findMany:async()=>[]},order:{findMany:async(query:any)=>{if(query.distinct)return [{paymentMethod:'cash'}];reads.push(query);return orders},aggregate:async()=>({_sum:{}})},shiftSession:{findMany:async()=>[]},shift:{findMany:async()=>[]},staff:{findMany:async()=>[]},user:{findMany:async()=>[]}}
 return {db,reads}
}
test('gross profit query uses historical cost, removes tax and discounts, supports filters and reconciles totals',async()=>{
 const {db,reads}=dbFor([order(),order({id:'o2',items:[{...order().items[0],bomCost:600}]})])
 const options=await revenueQueryOptions(db,'store');const option=options.datasets.find(o=>o.value==='grossProfit')!
 assert.equal(option.paymentFilter,true);assert.equal(option.channelFilter,true)
 let verified=0
 const result=await revenueQuery(db,'store',{dataset:'grossProfit',period:'today',paymentMethod:'cash',channelId:'none'},true,now,async orders=>{verified=orders.length})
 assert.equal(verified,2);assert.equal(result.rows[0].amount===500||result.rows[1].amount===500,true)
 assert.equal(result.summary.amount,200);assert.equal(result.summary.missingCount,0)
 assert.equal(result.breakdown.reduce((s,r)=>s+r.amount,0),result.summary.amount)
 assert.deepEqual(reads[0].where.status.in,['completed','paid','refunded']);assert.equal(reads[0].where.paymentMethod,'cash');assert.equal(reads[0].where.channelId,null)
})
test('prepared full refund retains cost; unprepared refund removes cost; unknown cost/evidence stays missing',async()=>{
 const refunded=order({status:'refunded',refundRequests:[{status:'approved',amount:990,reasonCode:'customer_dissatisfied',selectedItemIds:'["line"]'}]})
 const unprepared=order({id:'o2',status:'refunded',refundRequests:[{status:'approved',amount:990,reasonCode:'paid_unprepared',selectedItemIds:'["line"]'}]})
 const unknown=order({id:'o3',items:[{...order().items[0],bomCost:0}]})
 const legacy=order({id:'o4',requestFingerprint:null})
 const {db}=dbFor([refunded,unprepared,unknown,legacy])
 const result=await revenueQuery(db,'store',{dataset:'grossProfit'},true,now,async()=>{})
 assert.equal(result.rows.find(r=>r.id==='o1')!.amount,-400)
 assert.equal(result.rows.find(r=>r.id==='o2')!.amount,0)
 assert.equal(result.rows.find(r=>r.id==='o3')!.amount,null)
 assert.equal(result.rows.find(r=>r.id==='o4')!.amount,null)
 assert.equal(result.summary.amount,-400);assert.equal(result.summary.missingCount,2)
})
test('product gross profit matches query basis, includes losses and excludes unknown costs',()=>{
 const normal=summarizeProducts([order()],[product],{days:30}).list[0]
 assert.equal(normal.grossProfit,500)
 const loss=summarizeProducts([order({items:[{...order().items[0],bomCost:600}]})],[product],{days:30}).list[0]
 assert.equal(loss.grossProfit,-300)
 const unknown=summarizeProducts([order({items:[{...order().items[0],bomCost:0}]})],[product],{days:30})
 assert.equal(unknown.list[0].grossProfit,null);assert.equal(unknown.overview.profitIncomplete,1)
 assert.equal(summarizeProducts([order()],[product],{days:30,categoryId:'other'}).list.length,0)
})
test('empty gross profit query returns zero with no missing evidence',async()=>{
 const {db}=dbFor([]);const result=await revenueQuery(db,'store',{dataset:'grossProfit'},true,now,async()=>{})
 assert.equal(result.summary.amount,0);assert.equal(result.summary.count,0);assert.equal(result.summary.missingCount,0)
})
