import {afterAll,beforeAll,expect,jest,test} from '@jest/globals'
// No referral/message transport or background scheduler in this test process.
jest.mock('../src/services/ReferralService',()=>({processOrderReferralRewards:jest.fn(async()=>undefined)}))
import prisma from '../src/config/database'
import {savePaymentEvidence,getPaymentEvidence} from '../src/services/PaymentEvidenceService'
import {createOrder,refundOrder,createRefundRequest,updateOrderStatus,bulkCreateOrders} from '../src/services/OrderService'
import {handleQrisWebhook} from '../src/services/PaymentService'
import {redeemPoints,earnPoints,adjustPoints} from '../src/services/MemberService'
let seq=0
beforeAll(async()=>{
 const rows=await prisma.$queryRawUnsafe<Array<{database:string;tcp:string|null;socket:string}>>("SELECT current_database() AS database, inet_server_addr()::text AS tcp, current_setting('unix_socket_directories') AS socket")
 expect(rows[0].database).toBe('bubble_audit_test');expect(rows[0].tcp).toBeNull()
 expect(rows[0].socket).toBe(new URL(process.env.DATABASE_URL!).searchParams.get('host'))
})
afterAll(async()=>{await prisma.$disconnect()})
async function fixture(){
 const key=`${Date.now()}-${++seq}`
 const tenant=await prisma.tenant.create({data:{name:`Synthetic ${key}`}})
 const store=await prisma.store.create({data:{tenantId:tenant.id,name:`Audit ${key}`}})
 const category=await prisma.category.create({data:{storeId:store.id,name:'Tea'}})
 const product=await prisma.product.create({data:{storeId:store.id,categoryId:category.id,code:key,name:'Synthetic Tea'}})
 const spec=await prisma.spec.create({data:{productId:product.id,name:'Regular',price:100}})
 const inventory=await prisma.inventory.create({data:{storeId:store.id,name:'Synthetic ingredient',category:'tea',unit:'g',currentStock:100,avgCost:BigInt(100)}})
 await prisma.bOMItem.create({data:{productId:product.id,inventoryId:inventory.id,quantity:2,unit:'g'}})
 const request={storeId:store.id,staffId:'synthetic-staff',orderNumber:`AUDIT-${key}`,pickupNumber:'A01',paymentMethod:'cash',taxEnabled:false,items:[{productId:product.id,productName:'Synthetic Tea',specId:spec.id,specName:'Regular',quantity:1,unitPrice:100}]}
 return {key,store,product,spec,inventory,request}
}
test('prepared-product refund leaves consumed stock deducted with BigInt costs',async()=>{
 const f=await fixture();const sale=await createOrder(f.request)
 await refundOrder(sale.id)
 expect((await prisma.order.findUniqueOrThrow({where:{id:sale.id}})).status).toBe('refunded')
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(98)
 expect(await prisma.cashEvent.count({where:{storeId:f.store.id,type:'cash_out'}})).toBe(1)
})
test('injected database cash-event failure rolls back refund and approval, then retry commits',async()=>{
 const f=await fixture();const sale=await createOrder(f.request)
 const request=await prisma.refundRequest.create({data:{orderId:sale.id,amount:100,reason:'synthetic',requestedBy:'synthetic-staff'}})
 await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION audit_reject_cash_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."storeId" = '${f.store.id}' THEN RAISE EXCEPTION 'AUDIT_INJECTED_CASH_EVENT_FAILURE'; END IF; RETURN NEW; END $$`)
 await prisma.$executeRawUnsafe('CREATE TRIGGER audit_cash_failure BEFORE INSERT ON "CashEvent" FOR EACH ROW EXECUTE FUNCTION audit_reject_cash_event()')
 try {
  await expect(refundOrder(sale.id,'synthetic','synthetic-staff',100,{requestId:request.id,approvedBy:'synthetic-staff'})).rejects.toThrow()
  expect((await prisma.order.findUniqueOrThrow({where:{id:sale.id}})).status).toBe('completed')
  expect((await prisma.refundRequest.findUniqueOrThrow({where:{id:request.id}})).status).toBe('pending')
  expect(await prisma.cashEvent.count({where:{storeId:f.store.id,type:'cash_out'}})).toBe(0)
 } finally { await prisma.$executeRawUnsafe('DROP TRIGGER audit_cash_failure ON "CashEvent"') }
 await refundOrder(sale.id,'synthetic','synthetic-staff',100,{requestId:request.id,approvedBy:'synthetic-staff'})
 expect((await prisma.refundRequest.findUniqueOrThrow({where:{id:request.id}})).status).toBe('approved')
})
test('two concurrent refund requests produce exactly one cash reversal without restocking',async()=>{
 const f=await fixture();const sale=await createOrder(f.request)
 const results=await Promise.allSettled([refundOrder(sale.id),refundOrder(sale.id)])
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
 expect(await prisma.cashEvent.count({where:{storeId:f.store.id,type:'cash_out'}})).toBe(1)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(98)
})
test('two concurrent same-key checkouts store one sale and retry returns it',async()=>{
 const f=await fixture()
 const results=await Promise.allSettled([createOrder(f.request),createOrder(f.request)])
 expect(results.some(r=>r.status==='fulfilled')).toBe(true)
 expect(await prisma.order.count({where:{orderNumber:f.request.orderNumber}})).toBe(1)
 const replay=await createOrder(f.request)
 expect(replay.orderNumber).toBe(f.request.orderNumber)
 expect(await prisma.cashEvent.count({where:{storeId:f.store.id,type:'cash_sale'}})).toBe(1)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(98)
})
test('two orders racing for one confirmed QRIS produce exactly one linked sale',async()=>{
 const f=await fixture();const externalId=`QRIS2-${f.key}`
 const payment=await prisma.qrisPayment.create({data:{storeId:f.store.id,externalId,amount:100,status:'completed',qrString:'synthetic'}})
 const input={...f.request,paymentMethod:'qris',qrisExternalId:externalId}
 const results=await Promise.allSettled([createOrder(input),createOrder({...input,orderNumber:input.orderNumber+'-other'})])
 expect(results.some(r=>r.status==='fulfilled')).toBe(true)
 expect(await prisma.order.count({where:{storeId:f.store.id}})).toBe(1)
 expect((await prisma.qrisPayment.findUniqueOrThrow({where:{id:payment.id}})).orderId).toBeTruthy()
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(98)
})
test('foreign-store product/member references cannot mutate another store',async()=>{
 const a=await fixture(),b=await fixture()
 await expect(createOrder({...a.request,items:b.request.items})).rejects.toThrow('PRODUCT_STORE_MISMATCH')
 const member=await prisma.member.create({data:{storeId:b.store.id,name:'Synthetic member',phone:`test-${b.key}`,points:100}})
 await expect(createOrder({...a.request,memberId:member.id})).rejects.toThrow('MEMBER_STORE_MISMATCH')
 expect(await prisma.order.count({where:{storeId:a.store.id}})).toBe(0)
 expect((await prisma.member.findUniqueOrThrow({where:{id:member.id}})).points).toBe(100)
})
test('concurrent point redemptions cannot overspend balance',async()=>{
 const f=await fixture();const member=await prisma.member.create({data:{storeId:f.store.id,name:'Synthetic member',phone:`test-${f.key}`,points:100}})
 const results=await Promise.allSettled([redeemPoints(member.id,80,'synthetic'),redeemPoints(member.id,80,'synthetic')])
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
 expect((await prisma.member.findUniqueOrThrow({where:{id:member.id}})).points).toBe(20)
 expect(await prisma.pointLog.count({where:{memberId:member.id,type:'redeem'}})).toBe(1)
})

test.each([['redeem',redeemPoints],['earn',earnPoints],['adjust',adjustPoints]] as const)('%s point-log database failure rolls back balance',async(_name,operation)=>{
 const f=await fixture();const member=await prisma.member.create({data:{storeId:f.store.id,name:'Synthetic member',phone:`test-${f.key}`,points:100}})
 await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION audit_reject_point_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."memberId" = '${member.id}' THEN RAISE EXCEPTION 'AUDIT_INJECTED_POINT_LOG_FAILURE'; END IF; RETURN NEW; END $$`)
 await prisma.$executeRawUnsafe('CREATE TRIGGER audit_point_failure BEFORE INSERT ON "PointLog" FOR EACH ROW EXECUTE FUNCTION audit_reject_point_log()')
 try {
  await expect(operation(member.id,80,'synthetic')).rejects.toThrow()
  expect((await prisma.member.findUniqueOrThrow({where:{id:member.id}})).points).toBe(100)
 } finally {await prisma.$executeRawUnsafe('DROP TRIGGER audit_point_failure ON "PointLog"')}
})

test('concurrent manual point deductions cannot overdraw or lose a ledger entry',async()=>{
 const f=await fixture();const member=await prisma.member.create({data:{storeId:f.store.id,name:'Synthetic member',phone:`test-${f.key}`,points:100}})
 const results=await Promise.allSettled([adjustPoints(member.id,-80,'synthetic'),adjustPoints(member.id,-80,'synthetic')])
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
 expect((await prisma.member.findUniqueOrThrow({where:{id:member.id}})).points).toBe(20)
 expect(await prisma.pointLog.count({where:{memberId:member.id,type:'adjust'}})).toBe(1)
})

const syntheticPhoto = (key: string) => Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from(`SYNTHETIC-NOT-A-CUSTOMER-PHOTO-${key}`)])
test('manual photo is privately scoped and atomically records order amount, confirmer and server time',async()=>{
 const f=await fixture();const image=syntheticPhoto(f.key)
 const proof=await savePaymentEvidence(f.store.id,'audit-user',100,image)
 expect(proof.verification).toBe('unverified');expect(proof).not.toHaveProperty('image')
 expect(await getPaymentEvidence(proof.id,'foreign-store')).toBeNull()
 const sale=await createOrder({...f.request,paymentMethod:'qris',paymentEvidenceId:proof.id,manualPaymentActorId:'audit-user'})
 const linked=await getPaymentEvidence(proof.id,f.store.id)
 expect(linked).toMatchObject({orderId:sale.id,amount:100,uploadedBy:'audit-user',confirmedBy:'audit-user',verification:'staff_confirmed'})
 expect(linked!.confirmedAt).toBeInstanceOf(Date)
 await expect(prisma.order.delete({where:{id:sale.id}})).rejects.toThrow()
 expect((await createOrder({...f.request,paymentMethod:'qris',paymentEvidenceId:proof.id,manualPaymentActorId:'audit-user'})).id).toBe(sale.id)
 await expect(savePaymentEvidence(f.store.id,'audit-user',100,image)).rejects.toThrow('PAYMENT_EVIDENCE_ALREADY_USED')
})
test('manual proof rejects wrong amount, actor or store and cannot be spent on two orders',async()=>{
 const f=await fixture();const proof=await savePaymentEvidence(f.store.id,'audit-user',100,syntheticPhoto(f.key))
 const input={...f.request,paymentMethod:'qris',paymentEvidenceId:proof.id,manualPaymentActorId:'audit-user'}
 await expect(createOrder({...input,manualPaymentActorId:'forged-user'})).rejects.toThrow('PAYMENT_EVIDENCE_ORIGINAL_OPERATOR_REQUIRED')
 await expect(createOrder({...input,discountAmount:1})).rejects.toThrow('PAYMENT_EVIDENCE_MISMATCH')
 const b=await fixture()
 await expect(createOrder({...b.request,paymentMethod:'qris',paymentEvidenceId:proof.id,manualPaymentActorId:'audit-user'})).rejects.toThrow('PAYMENT_EVIDENCE_MISMATCH')
 const results=await Promise.allSettled([createOrder(input),createOrder({...input,orderNumber:input.orderNumber+'-second'})])
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
 expect(await prisma.order.count({where:{storeId:f.store.id}})).toBe(1)
})
test('failed sale leaves manual proof unclaimed for retry',async()=>{
 const f=await fixture();const proof=await savePaymentEvidence(f.store.id,'audit-user',100,syntheticPhoto(f.key))
 await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION audit_reject_evidence_claim() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."id" = '${proof.id}' THEN RAISE EXCEPTION 'AUDIT_INJECTED_EVIDENCE_FAILURE'; END IF; RETURN NEW; END $$`)
 await prisma.$executeRawUnsafe('CREATE TRIGGER audit_evidence_failure BEFORE UPDATE ON "PaymentEvidence" FOR EACH ROW EXECUTE FUNCTION audit_reject_evidence_claim()')
 try {await expect(createOrder({...f.request,paymentMethod:'qris',paymentEvidenceId:proof.id,manualPaymentActorId:'audit-user'})).rejects.toThrow()}
 finally {await prisma.$executeRawUnsafe('DROP TRIGGER audit_evidence_failure ON "PaymentEvidence"')}
 expect((await getPaymentEvidence(proof.id,f.store.id))!.orderId).toBeNull()
 expect(await prisma.order.count({where:{storeId:f.store.id}})).toBe(0)
})

test('refund request rejects unrelated lines and records an explicit unprepared claim without restocking',async()=>{
 const f=await fixture();const sale=await createOrder(f.request)
 await expect(createRefundRequest({orderId:sale.id,reason:'synthetic',requestedBy:'audit-cashier',reasonCode:'customer_dissatisfied',selectedItemIds:['foreign-line']})).rejects.toThrow('INVALID_REFUND_ITEMS')
 const request=await createRefundRequest({orderId:sale.id,reason:'synthetic cashier claim',requestedBy:'audit-cashier',reasonCode:'paid_unprepared',selectedItemIds:sale.items.map(item=>item.id)})
 expect(request.reasonCode).toBe('paid_unprepared');expect(request.status).toBe('pending')
 expect(JSON.parse(request.selectedItemIds)).toEqual(sale.items.map(item=>item.id))
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(98)
 expect((await prisma.order.findUniqueOrThrow({where:{id:sale.id}})).status).toBe('completed')
})

test('generic status update cannot turn a paid sale into refunded without its ledger transaction',async()=>{
 const f=await fixture();const sale=await createOrder(f.request)
 await expect(updateOrderStatus(sale.id,'refunded')).rejects.toThrow()
 expect((await prisma.order.findUniqueOrThrow({where:{id:sale.id}})).status).toBe('completed')
 expect(await prisma.cashEvent.count({where:{storeId:f.store.id,type:'cash_out'}})).toBe(0)
})

// Pause exactly one real transaction after its member read, then let the competing
// real transaction commit. This deterministically reproduces the stale-read race.
async function raceAfterRefundMemberRead(memberId:string, refund:()=>Promise<unknown>, competing:()=>Promise<unknown>){
 let announce!:()=>void,release!:()=>void
 const read=new Promise<void>(resolve=>{announce=resolve});const resume=new Promise<void>(resolve=>{release=resolve})
 const original=prisma.$transaction.bind(prisma) as any;let intercepted=false
 const spy=jest.spyOn(prisma,'$transaction').mockImplementation(((callback:any,...options:any[])=>original(async(tx:any)=>{
  const member=new Proxy(tx.member,{get(target,key){if(key!=='findUnique')return Reflect.get(target,key);return async(args:any)=>{
   const result=await target.findUnique(args)
   if(!intercepted&&args.where?.id===memberId){intercepted=true;announce();await resume}
   return result
  }}})
  return callback(new Proxy(tx,{get(target,key){return key==='member'?member:Reflect.get(target,key)}}))
 },...options)) as any)
 const pending=refund();let timer:ReturnType<typeof setTimeout>|undefined
 try{
  await Promise.race([read,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('refund member read did not occur')),3000)})])
  await competing();release();return await pending
 }finally{if(timer)clearTimeout(timer);release();spy.mockRestore();await pending.catch(()=>{})}
}
test('refund racing point redemption cannot drive balance negative and logs only its applied reversal',async()=>{
 const f=await fixture();const sale=await createOrder(f.request)
 const m=await prisma.member.create({data:{storeId:f.store.id,name:'Synthetic race',phone:`race-${f.key}`,points:100,totalSpent:100}})
 await prisma.order.update({where:{id:sale.id},data:{memberId:m.id}})
 await prisma.pointLog.create({data:{memberId:m.id,orderId:sale.id,type:'earn',points:100,note:'Synthetic earned before race'}})
 await raceAfterRefundMemberRead(m.id,()=>refundOrder(sale.id),()=>redeemPoints(m.id,80,'Concurrent synthetic redemption'))
 expect((await prisma.member.findUniqueOrThrow({where:{id:m.id}})).points).toBe(0)
 const reversal=await prisma.pointLog.aggregate({where:{memberId:m.id,orderId:sale.id,type:'adjust'},_sum:{points:true}})
 expect(reversal._sum.points).toBe(-20)
})
test('two different refunds racing on one member cannot double-deduct the same remaining points',async()=>{
 const f=await fixture();const a=await createOrder(f.request);const b=await createOrder({...f.request,orderNumber:f.request.orderNumber+'-B'})
 const m=await prisma.member.create({data:{storeId:f.store.id,name:'Synthetic double refund',phone:`race-${f.key}`,points:100,totalSpent:200}})
 for(const sale of [a,b]){await prisma.order.update({where:{id:sale.id},data:{memberId:m.id}});await prisma.pointLog.create({data:{memberId:m.id,orderId:sale.id,type:'earn',points:100,note:'Synthetic original earning'}})}
 await prisma.pointLog.create({data:{memberId:m.id,type:'redeem',points:-100,note:'Synthetic earlier redemption'}})
 await raceAfterRefundMemberRead(m.id,()=>refundOrder(a.id),()=>refundOrder(b.id))
 const member=await prisma.member.findUniqueOrThrow({where:{id:m.id}});expect(member.points).toBe(0);expect(member.totalSpent).toBe(0)
 expect((await prisma.pointLog.aggregate({where:{memberId:m.id,type:'adjust'},_sum:{points:true}}))._sum.points).toBe(-100)
 expect(await prisma.cashEvent.count({where:{storeId:f.store.id,type:'cash_out'}})).toBe(2)
})
test.each(['cash','qris'])('exact %s checkout replay survives consumed points without repricing or another ledger write',async paymentMethod=>{
 const f=await fixture();const member=await prisma.member.create({data:{storeId:f.store.id,name:'Synthetic replay',phone:`replay-${f.key}`,points:5000}})
 const proof=paymentMethod==='qris'?await savePaymentEvidence(f.store.id,'cashier-a',50,syntheticPhoto(f.key)):null
 const input={...f.request,paymentMethod,memberId:member.id,pointsRedeemed:5000,paymentEvidenceId:proof?.id,manualPaymentActorId:'cashier-a'}
 const sale=await createOrder(input)
 const replay=await createOrder(input)
 expect(replay.id).toBe(sale.id);expect(replay.grandTotal).toBe(50)
 expect(await prisma.order.count({where:{storeId:f.store.id}})).toBe(1)
 expect((await prisma.member.findUniqueOrThrow({where:{id:member.id}})).points).toBe(0)
 await expect(createOrder({...input,discountAmount:1})).rejects.toThrow()
})
test('cashier B may retry the already-bound same-store receipt without changing original confirmer A',async()=>{
 const f=await fixture();const proof=await savePaymentEvidence(f.store.id,'cashier-a',100,syntheticPhoto(f.key))
 const input={...f.request,paymentMethod:'qris',paymentEvidenceId:proof.id,manualPaymentActorId:'cashier-a'}
 const sale=await createOrder(input)
 const replay=await createOrder({...input,manualPaymentActorId:'forged-client-a'},{actorId:'cashier-b',storeId:f.store.id,allowCreate:false})
 expect(replay.id).toBe(sale.id)
 expect((await getPaymentEvidence(proof.id,f.store.id))!.confirmedBy).toBe('cashier-a')
 expect(await prisma.order.count({where:{storeId:f.store.id}})).toBe(1)
})

test('closed-shift replay is authorized separately; no new order or cross-store replay is permitted',async()=>{
 const f=await fixture();const sale=await createOrder(f.request)
 const context={actorId:'cashier-b',storeId:f.store.id,allowCreate:false}
 const replay=await createOrder(f.request,context)
 expect(replay.id).toBe(sale.id);expect(replay.replayedBy).toBe('cashier-b')
 await expect(createOrder({...f.request,orderNumber:f.request.orderNumber+'-NEW'},context)).rejects.toThrow('OPEN_SHIFT_REQUIRED')
 await expect(createOrder(f.request,{...context,storeId:'foreign'})).rejects.toThrow('ORDER_REPLAY_STORE_MISMATCH')
 const results=await bulkCreateOrders([f.request,{...f.request,orderNumber:f.request.orderNumber+'-NEW'}],context,[false,false])
 expect(results.map(r=>r.success)).toEqual([true,false]);expect(results[1].error).toBe('OPEN_SHIFT_REQUIRED')
})
test('cashier B cannot create an unbound photo sale by forging A in client data',async()=>{
 const f=await fixture();const proof=await savePaymentEvidence(f.store.id,'cashier-a',100,syntheticPhoto(f.key))
 const input={...f.request,paymentMethod:'qris',paymentEvidenceId:proof.id,manualPaymentActorId:'cashier-a'}
 await expect(createOrder(input,{actorId:'cashier-b',storeId:f.store.id,allowCreate:true})).rejects.toThrow('PAYMENT_EVIDENCE_ORIGINAL_OPERATOR_REQUIRED')
 expect((await getPaymentEvidence(proof.id,f.store.id))!.orderId).toBeNull()
 expect(await prisma.order.count({where:{storeId:f.store.id}})).toBe(0)
})
test('explicit preparation transitions cannot resurrect or erase paid/refunded orders',async()=>{
 const f=await fixture();const sale=await createOrder(f.request)
 for(const status of ['preparing','ready','pending','paid','completed','suspended','cancelled','refunded'])await expect(updateOrderStatus(sale.id,status)).rejects.toThrow()
 const pending=await prisma.order.create({data:{storeId:f.store.id,staffId:'synthetic',orderNumber:f.request.orderNumber+'-pending',totalAmount:100,finalAmount:100,paymentMethod:'cash',status:'pending'}})
 expect((await updateOrderStatus(pending.id,'preparing')).status).toBe('preparing')
 expect((await updateOrderStatus(pending.id,'ready')).status).toBe('ready')
 await expect(updateOrderStatus(pending.id,'completed')).rejects.toThrow('ORDER_FINANCIAL_STATUS_PROTECTED')
 await refundOrder(sale.id)
 await expect(updateOrderStatus(sale.id,'preparing')).rejects.toThrow('ORDER_STATUS_TRANSITION_CONFLICT')
})

test('refund CAS and point log roll back together when the database rejects the reversal log',async()=>{
 const f=await fixture();const sale=await createOrder(f.request)
 const m=await prisma.member.create({data:{storeId:f.store.id,name:'Synthetic refund rollback',phone:`rollback-${f.key}`,points:100,totalSpent:100}})
 await prisma.order.update({where:{id:sale.id},data:{memberId:m.id}})
 await prisma.pointLog.create({data:{memberId:m.id,orderId:sale.id,type:'earn',points:100,note:'Synthetic original earning'}})
 await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION audit_reject_refund_points() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."memberId" = '${m.id}' AND NEW."type" = 'adjust' THEN RAISE EXCEPTION 'AUDIT_REFUND_POINT_LOG_FAILURE'; END IF; RETURN NEW; END $$`)
 await prisma.$executeRawUnsafe('CREATE TRIGGER audit_refund_point_failure BEFORE INSERT ON "PointLog" FOR EACH ROW EXECUTE FUNCTION audit_reject_refund_points()')
 try{
  await expect(refundOrder(sale.id)).rejects.toThrow()
  expect((await prisma.member.findUniqueOrThrow({where:{id:m.id}})).points).toBe(100)
  expect((await prisma.order.findUniqueOrThrow({where:{id:sale.id}})).status).toBe('completed')
  expect(await prisma.cashEvent.count({where:{storeId:f.store.id,type:'cash_out'}})).toBe(0)
 }finally{await prisma.$executeRawUnsafe('DROP TRIGGER audit_refund_point_failure ON "PointLog"')}
 await refundOrder(sale.id)
 expect((await prisma.member.findUniqueOrThrow({where:{id:m.id}})).points).toBe(0)
 expect(await prisma.pointLog.count({where:{memberId:m.id,type:'adjust'}})).toBe(1)
})

test('concurrent administrator unprepared approvals restore original stock once after BOM changed',async()=>{
 const f=await fixture();const sale=await createOrder(f.request)
 await prisma.bOMItem.updateMany({where:{productId:f.product.id},data:{quantity:50}})
 const request=await prisma.refundRequest.create({data:{orderId:sale.id,reason:'not prepared',reasonCode:'paid_unprepared',selectedItemIds:JSON.stringify(sale.items.map(i=>i.id)),requestedBy:'cashier'}})
 const approval={requestId:request.id,approvedBy:'admin',restoreUnprepared:true}
 const results=await Promise.allSettled([refundOrder(sale.id,'verified',undefined,undefined,approval),refundOrder(sale.id,'verified',undefined,undefined,approval)])
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(100)
 expect(await prisma.stockOutLog.count({where:{orderId:sale.id,reason:'refund_unprepared'}})).toBe(1)
 expect((await prisma.refundRequest.findUniqueOrThrow({where:{id:request.id}})).status).toBe('approved')
})
test('unprepared reversal rejects foreign-store deduction and rolls back status/stock',async()=>{
 const f=await fixture(),foreign=await fixture();const sale=await createOrder(f.request)
 await prisma.stockOutLog.create({data:{inventoryId:foreign.inventory.id,quantity:1,reason:'sold',orderId:sale.id}})
 const request=await prisma.refundRequest.create({data:{orderId:sale.id,reason:'not prepared',reasonCode:'paid_unprepared',requestedBy:'cashier'}})
 await expect(refundOrder(sale.id,'verified',undefined,undefined,{requestId:request.id,approvedBy:'admin',restoreUnprepared:true})).rejects.toThrow('INVALID_ORIGINAL_STOCK_LEDGER')
 expect((await prisma.order.findUniqueOrThrow({where:{id:sale.id}})).status).toBe('completed')
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(98)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:foreign.inventory.id}})).currentStock).toBe(100)
})
