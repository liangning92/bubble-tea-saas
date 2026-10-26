// Discount provenance: order record, shift evidence and printed receipt agree on every bucket.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require,Buffer,Date,Map,Set,console});return m.exports;}

for(const path of ['shared/utils/orderDiscount.ts','server/src/utils/orderDiscount.ts']){
  const {buildDiscountBreakdown,orderDiscountTotal}=load(path)
  test(path+' splits the winning candidate, points and manual discounts',()=>{
    const activity=buildDiscountBreakdown({applied:{kind:'activity',id:'a1',name:'Happy Hour',discount:3000},pointsValue:0,manualDiscountAmount:0})
    assert.deepEqual(JSON.parse(JSON.stringify(activity.lines)),[{key:'activity',amount:3000,name:'Happy Hour',sourceId:'a1'}]);assert.equal(activity.total,3000);assert.equal(activity.activitySource,'activity')
    const coupon=buildDiscountBreakdown({applied:{kind:'coupon',id:'c1',name:'VIP',discount:2000},pointsValue:0,manualDiscountAmount:500})
    assert.deepEqual(Array.from(coupon.lines,line=>line.key),['coupon','manual']);assert.equal(coupon.total,2500)
    const points=buildDiscountBreakdown({applied:{kind:'points',id:'points',name:'Points',discount:1000},pointsValue:1000,manualDiscountAmount:0})
    assert.deepEqual(Array.from(points.lines,line=>line.key),['points']);assert.equal(points.total,1000)
    assert.equal(buildDiscountBreakdown({applied:null,pointsValue:0,manualDiscountAmount:0}).total,0)
    assert.equal(buildDiscountBreakdown({applied:{kind:'activity',id:'a',name:'n',discount:0},pointsValue:0,manualDiscountAmount:0}).lines.length,0)
  })
  test(path+' totals the stored discount plus the points value that is never stored in it',()=>{
    assert.equal(orderDiscountTotal({discountAmount:3000,pointsDiscountAmount:1000}),4000)
    assert.equal(orderDiscountTotal({discountAmount:0,pointsDiscountAmount:0}),0)
    assert.equal(orderDiscountTotal({}),0)
  })
}

test('both discount helper copies stay byte-identical',()=>{
  assert.equal(fs.readFileSync('shared/utils/orderDiscount.ts','utf8'),fs.readFileSync('server/src/utils/orderDiscount.ts','utf8'))
})

test('shift evidence reports every discount bucket and the orders that caused them',async()=>{
  const moduleObject={exports:{}}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/src/services/ShiftSummaryEvidence.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:moduleObject,exports:moduleObject.exports,Date,require:name=>{
    if(name==='./ShiftCashReconciliation')return {calculateShiftCash:()=>{throw Error('no refund/expense database in this fixture')}}
    if(name==='../utils/orderDiscount')return load('server/src/utils/orderDiscount.ts')
    throw Error('Unexpected dependency '+name)
  }})
  const {loadShiftSummaryEvidence}=moduleObject.exports
  const openedAt=new Date('2026-10-20T10:00:00Z'),closedAt=new Date('2026-10-20T18:00:00Z')
  const orders=[
    {orderNumber:'ORD-1',pickupNumber:'A01',storeId:'store-a',createdAt:new Date('2026-10-20T11:00:00Z'),finalAmount:16000,status:'completed',paymentMethod:'cash',discountAmount:2000,activityDiscountAmount:2000,couponDiscountAmount:0,pointsDiscountAmount:0,manualDiscountAmount:0,activityName:'Happy Hour',activitySource:'activity',items:[{quantity:2}]},
    {orderNumber:'ORD-2',pickupNumber:'A02',storeId:'store-a',createdAt:new Date('2026-10-20T12:00:00Z'),finalAmount:9000,status:'completed',paymentMethod:'qris',discountAmount:1000,activityDiscountAmount:0,couponDiscountAmount:0,pointsDiscountAmount:500,manualDiscountAmount:0,activityName:null,activitySource:'points',items:[{quantity:1}]},
    {orderNumber:'ORD-3',storeId:'store-a',createdAt:new Date('2026-10-20T13:00:00Z'),finalAmount:5000,status:'completed',paymentMethod:'cash',discountAmount:0,activityDiscountAmount:0,couponDiscountAmount:0,pointsDiscountAmount:0,manualDiscountAmount:0,activityName:null,activitySource:null,items:[{quantity:1}]}
  ]
  const db={
    shiftSession:{findMany:async()=>[{id:'s1',storeId:'store-a',shift:'evening',status:'open',openFloat:50000,openedAt}]},
    cashEvent:{findMany:async()=>[]},
    order:{findMany:async()=>orders}
  }
  const {summaryEvidence}=await loadShiftSummaryEvidence(db,'store-a',closedAt)
  assert.equal(summaryEvidence.activityDiscountAmount,2000)
  assert.equal(summaryEvidence.pointsDiscountAmount,500)
  assert.equal(summaryEvidence.totalDiscountAmount,3500)
  assert.equal(summaryEvidence.activityOrderCount,1)
  assert.equal(summaryEvidence.activityOrders.length,1)
  assert.equal(summaryEvidence.activityOrders[0].orderNumber,'ORD-1')
  assert.equal(summaryEvidence.activityOrders[0].activityName,'Happy Hour')
  assert.equal(summaryEvidence.activityOrders[0].totalDiscountAmount,2000)
})

test('printed receipt shows every discount bucket and keeps subtotal, discount and total reconciling',()=>{
  const {receiptHtml}=load('client-pos/electron/receiptLayout.ts')
  const html=receiptHtml({language:'en',paperSize:'80mm',storeName:'Store',orderNum:'ORD-1',items:[{productName:'Tea',quantity:1,unitPrice:20000}],subtotal:20000,tax:2200,discount:4500,discountLines:[{key:'activity',amount:3000,name:'Happy Hour'},{key:'points',amount:1000},{key:'manual',amount:500}],total:17700,blocks:[{type:'items',config:{},style:{},order:0,enabled:true},{type:'subtotal',config:{},style:{},order:1,enabled:true},{type:'tax',config:{},style:{},order:2,enabled:true},{type:'total',config:{},style:{},order:3,enabled:true}]})
  assert.ok(html.includes('Happy Hour'),'activity name');assert.ok(html.includes('Activity'),'activity bucket label')
  assert.ok(html.includes('Points'),'points bucket label');assert.ok(html.includes('Manual'),'manual bucket label')
  assert.ok(html.includes('4.500'),'total discount');assert.ok(html.includes('17.700'),'total')
  assert.ok(html.includes('20.000'),'subtotal')
})

test('handover receipt lists the shift discount totals and the orders that triggered an activity',()=>{
  const {shiftReceiptLayout}=load('client-pos/electron/shiftReceiptLayout.ts')
  const {receiptHtml}=load('client-pos/electron/receiptLayout.ts')
  const html=receiptHtml(shiftReceiptLayout({language:'en',paperSize:'80mm',storeName:'Store',sessionId:'s1',cashierName:'Cashier',shiftType:'evening',openedAt:'2026-10-20T10:00:00Z',closedAt:'2026-10-20T18:00:00Z',openFloat:50000,actualCash:60000,handoverFinancials:{totalRevenue:200000,actualCashReceived:10000,expenses:0},manualReceipts:{cash:0,qris:0,shopeefood:0,gofood:0},summaryEvidence:{orderCount:3,cupCount:5,activityDiscountAmount:2000,totalDiscountAmount:3500,activityOrders:[{orderNumber:'ORD-1',pickupNumber:'A01',activityName:'Happy Hour',totalDiscountAmount:2000}]},purchaseExpenses:{items:[],total:0}}))
  assert.ok(html.includes('Activity discount'));assert.ok(html.includes('Total discount'))
  assert.ok(html.includes('2.000'));assert.ok(html.includes('3.500'))
  assert.ok(html.includes('ACTIVITY ORDERS'));assert.ok(html.includes('Happy Hour'));assert.ok(html.includes('#A01'))
})

test('historical recovery uses the sale-time server snapshot and never changes money',()=>{
  const {historicalOrderDiscount}=load('server/src/utils/historicalOrderDiscount.ts')
  const order={totalAmount:40000,discountAmount:11000,finalAmount:29000,checkoutTaxAmount:0}
  const snapshot={applied:{id:'old-activity',name:'Sale-time name',kind:'activity',discount:10000},paidAmount:30000,items:[{quantity:2,unitPrice:20000}]}
  const recovered=historicalOrderDiscount(order,snapshot)
  assert.equal(recovered.activityDiscountAmount,10000);assert.equal(recovered.manualDiscountAmount,1000);assert.equal(recovered.activityName,'Sale-time name')
  assert.equal(Object.hasOwn(recovered,'finalAmount'),false);assert.equal(Object.hasOwn(recovered,'discountAmount'),false)
  assert.equal(historicalOrderDiscount(order,{...snapshot,paidAmount:29000}),null)
  assert.equal(historicalOrderDiscount({...order,totalAmount:50000},snapshot),null)
  assert.equal(historicalOrderDiscount({...order,discountAmount:5000},snapshot),null)
  assert.equal(historicalOrderDiscount({...order,finalAmount:30000},snapshot),null)
  assert.equal(historicalOrderDiscount(order,{applied:{...snapshot.applied,discount:10000.1}}),null)
  assert.equal(historicalOrderDiscount(order,{applied:null}),null)
  const points=historicalOrderDiscount({totalAmount:40000,discountAmount:0,finalAmount:39000,checkoutTaxAmount:0},{...snapshot,applied:{id:'points',name:'Points',kind:'points',discount:1000},paidAmount:39000})
  assert.equal(points.pointsDiscountAmount,1000);assert.equal(points.activityDiscountAmount,0)
})

test('handover prints every triggering order with a unique order number, including after order 20',()=>{
  const {shiftReceiptLayout}=load('client-pos/electron/shiftReceiptLayout.ts')
  const {receiptHtml}=load('client-pos/electron/receiptLayout.ts')
  const activityOrders=Array.from({length:25},(_,i)=>({orderNumber:'UNIQUE-ORDER-'+(i+1),pickupNumber:'A01',activityName:'Happy Hour',totalDiscountAmount:2000}))
  const html=receiptHtml(shiftReceiptLayout({language:'en',paperSize:'58mm',summaryEvidence:{activityDiscountAmount:50000,totalDiscountAmount:50000,activityOrders}}))
  for(const order of activityOrders)assert.ok(html.includes(order.orderNumber),order.orderNumber)
  const source=fs.readFileSync('server/src/services/ShiftSummaryEvidence.ts','utf8')
  assert.equal(source.includes('.slice(0, 20)'),false,'API must not silently truncate settlement evidence')
})
