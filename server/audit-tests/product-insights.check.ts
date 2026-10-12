import test from 'node:test'
import assert from 'node:assert/strict'
import { insightPeriod, saleLines, summarizeProducts, productPreferences, productQuadrants } from '../src/utils/productInsights'
const catalog=[{id:'p1',name:'Tea',categoryId:'c1',category:{name:'Tea'}},{id:'p2',name:'Boba',categoryId:'c1',category:{name:'Tea'}},{id:'p3',name:'Unsold',categoryId:'c2',category:{name:'Ice'}}]
function order(id='o1'):any{return {id,status:'completed',totalAmount:1000,finalAmount:990,checkoutTaxAmount:90,discountAmount:100,requestFingerprint:'v1:test',channelId:'ch1',channel:{name:'POS'},refundRequests:[],items:[{id:'i1',productId:'p1',product:catalog[0],productName:'Tea',specId:'s1',specName:'Medium',quantity:2,unitPrice:300,bomCost:100,addons:'[{"name":"Pearl"},{"name":"Pearl"}]'},{id:'i2',productId:'p2',product:catalog[1],productName:'Boba',specId:'s2',specName:'Large',quantity:1,unitPrice:400,bomCost:200,addons:'[]'}]}}
test('store timezone and equal elapsed comparison windows',()=>{
 const period=insightPeriod(7,'Asia/Jakarta',new Date('2026-10-13T05:00:00Z'))
 assert.equal(period.start.toISOString(),'2026-10-06T17:00:00.000Z')
 assert.equal(period.previousStart.toISOString(),'2026-09-29T17:00:00.000Z')
 assert.equal(period.previousEnd.toISOString(),'2026-10-06T05:00:00.000Z')
 assert.equal(period.end.getTime()-period.start.getTime(),period.previousEnd.getTime()-period.previousStart.getTime())
 assert.throws(()=>insightPeriod(0,'Asia/Jakarta'))
})
test('DST midnight calculation uses the actual reporting timezone',()=>{
 const p=insightPeriod(3,'America/New_York',new Date('2026-03-09T15:00:00Z'))
 assert.equal(p.start.toISOString(),'2026-03-07T05:00:00.000Z')
})
test('discount and tax allocations sum exactly and preserve historical costs',()=>{
 const lines=saleLines(order());assert.equal(lines.reduce((s:number,l:any)=>s+l.revenue,0),900)
 assert.equal(lines[0].revenue,540);assert.equal(lines[1].revenue,360)
 assert.equal(lines[0].cost,200);assert.ok(lines.every((l:any)=>l.evidence))
})
test('partial dissatisfaction refund reduces selected revenue, retains consumed cost and demand',()=>{
 const o=order();o.refundRequests=[{amount:110,status:'approved',selectedItemIds:'["i1"]',reasonCode:'customer_dissatisfied'}]
 const lines=saleLines(o);assert.equal(lines[0].revenue,440);assert.equal(lines[1].revenue,360)
 assert.equal(lines[0].cost,200);assert.equal(lines[0].quantity,2)
})
test('unprepared refund removes selected demand and consumption; rejected refund is ignored',()=>{
 const o=order();o.refundRequests=[{amount:594,status:'approved',selectedItemIds:'["i1"]',reasonCode:'paid_unprepared'},{amount:20,status:'rejected'}]
 const lines=saleLines(o);assert.equal(lines[0].quantity,0);assert.equal(lines[0].cost,0);assert.equal(lines[0].revenue,0);assert.equal(lines[1].quantity,1)
})
test('order penetration deduplicates lines and includes only valid filtered orders',()=>{
 const a=order(),b=order('o2');b.items=[{...b.items[0],id:'j1',quantity:1,unitPrice:1000}]
 const result=summarizeProducts([a,b],catalog,{days:30})
 assert.equal(result.overview.orderCount,2);assert.equal(result.list.find(r=>r.productId==='p1').penetration,100)
 assert.equal(result.list.find(r=>r.productId==='p2').penetration,50)
 assert.equal(result.list.find(r=>r.productId==='p3').matrixType,'unsold')
 const filtered=summarizeProducts([a,b],catalog,{days:30,categoryId:'c2'})
 assert.equal(filtered.overview.orderCount,0);assert.equal(filtered.list.length,1)
})
test('missing historical cost and uncertain refunds cannot produce a high-margin classification',()=>{
 const a=order();a.items[0].bomCost=0
 const result=summarizeProducts([a],catalog,{days:30})
 assert.equal(result.list.find(r=>r.productId==='p1').matrixType,'incomplete')
 assert.equal(result.list.find(r=>r.productId==='p1').margin,null)
 const legacy=order();legacy.requestFingerprint=null
 assert.ok(summarizeProducts([legacy],catalog,{days:30}).list.filter(r=>r.quantity).every(r=>r.matrixType==='incomplete'))
})
test('pair recommendations require five distinct shared orders',()=>{
 assert.equal(summarizeProducts(Array.from({length:4},(_,i)=>order(String(i))),catalog,{days:30}).pairs.length,0)
 const result=summarizeProducts(Array.from({length:5},(_,i)=>order(String(i))),catalog,{days:30})
 assert.equal(result.pairs[0].orderCount,5)
})
test('size shares and modifier rates count quantities and deduplicate repeated modifiers',()=>{
 const pref=productPreferences([order()],'p1')
 assert.equal(pref.total,2);assert.equal(pref.specs[0].percentage,100);assert.equal(pref.addons[0].quantity,2)
 assert.equal(pref.addons[0].percentage,100)
 assert.deepEqual(productPreferences([],'p1'),{total:0,specs:[],addons:[]})
})

test('partial refunds without line selections are explicitly treated as estimates',()=>{
 const o=order();o.refundRequests=[{amount:110,status:'approved',selectedItemIds:'[]',reasonCode:'customer_dissatisfied'}]
 assert.ok(saleLines(o).every((l:any)=>!l.evidence))
 assert.ok(summarizeProducts([o],catalog,{days:30}).list.filter(r=>r.quantity).every(r=>r.margin===null))
})

test('quadrants keep full counts but rank only five sold products with reliable margins',()=>{
 const rows=['star','plowhorse','puzzle','dog'].flatMap(type=>Array.from({length:7},(_,i)=>({productId:`${type}-${i}`,quantity:i+1,margin:40+i,matrixType:type})))
 rows.push({productId:'unknown',quantity:99,margin:null as any,matrixType:'incomplete'},{productId:'unsold',quantity:0,margin:90,matrixType:'unsold'})
 const groups=productQuadrants(rows.reverse())
 assert.equal(groups.length,4)
 for(const group of groups){assert.equal(group.count,7);assert.deepEqual(group.products.map(p=>p.quantity),[7,6,5,4,3]);assert.ok(group.products.every(p=>p.matrixType===group.type))}
 assert.equal(productQuadrants([]).every(g=>g.count===0&&g.products.length===0),true)
 const ties=productQuadrants([{productId:'b',quantity:1,margin:50,matrixType:'star'},{productId:'c',quantity:1,margin:60,matrixType:'star'},{productId:'a',quantity:1,margin:50,matrixType:'star'}])
 assert.deepEqual(ties[0].products.map(p=>p.productId),['c','a','b'])
})
