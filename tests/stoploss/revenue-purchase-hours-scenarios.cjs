// Actual authenticated HTTP and task-owned Prisma databases; no production mutations.
const assert=require('node:assert/strict');
module.exports=async function({prisma,check,call,provider}){
 const {orderRequestFingerprint}=require('../../server/src/services/OrderReplayService.ts');
 const prefix='PURCHASE-HOUR-'+provider+'-';
 const create=async(name,at,customers,status='completed',storeId='store',requestFingerprint)=>prisma.order.create({data:{storeId,staffId:'staff',orderNumber:prefix+name,createdAt:new Date(at),customerCount:customers,status,paymentMethod:'cash',totalAmount:16000,finalAmount:16000,requestFingerprint}});
 await create('midnight','2031-10-06T17:00:00Z',2);await create('peak','2031-10-07T05:15:00Z',4,'paid');await create('peak2','2031-10-07T05:45:00Z',3);await create('refund','2031-10-07T16:59:59.999Z',2,'refunded');await create('legacy','2031-10-07T01:00:00Z',0);
 await create('before','2031-10-06T16:59:59.999Z',100);await create('after','2031-10-07T17:00:00Z',5);await create('pending','2031-10-07T05:00:00Z',100,'pending');await create('cancelled','2031-10-07T05:00:00Z',100,'cancelled');await create('foreign','2031-10-07T05:00:00Z',100,'completed','foreign');
 const request={storeId:'store',staffId:'staff',orderNumber:prefix+'delayed',customerCount:6,paymentMethod:'cash',items:[]};
 await create('delayed','2031-10-10T10:00:00Z',6,'completed','store',orderRequestFingerprint(request));
 await prisma.config.create({data:{storeId:'store',key:'receipts.pos.'+request.orderNumber,category:'pos_receipt_posted',value:JSON.stringify({receipt:{orderNumber:request.orderNumber,request,grandTotal:16000,occurredAt:'2031-10-07T05:00:00Z'}})}});
 const url='/api/revenue/purchase-hours?period=custom&startDate=2031-10-07&endDate=2031-10-07';
 const data=await check('GET',url+'&storeId=foreign');assert.equal(data.timezone,'Asia/Jakarta');assert.equal(data.days.length,1);assert.equal(data.days[0].hours.length,24);assert.equal(data.totalCustomers,18);assert.equal(data.totalOrders,6);assert.equal(data.days[0].hours[0].customers,2);assert.deepEqual(data.days[0].hours[12],{hour:12,customers:13,orders:3});assert.equal(data.days[0].hours[8].customers,1);assert.equal(data.days[0].hours[23].customers,2);
 const receiptKey={storeId_key:{storeId:'store',key:'receipts.pos.'+request.orderNumber}};const receiptRow=await prisma.config.findUnique({where:receiptKey});const wrongReceipt=JSON.parse(receiptRow.value);wrongReceipt.receipt.grandTotal=1;await prisma.config.update({where:receiptKey,data:{value:JSON.stringify(wrongReceipt)}});assert.equal((await check('GET',url)).totalCustomers,12,'Mismatched receipt must not move upload time');await prisma.config.update({where:receiptKey,data:{value:receiptRow.value}});
 const multi=await check('GET','/api/revenue/purchase-hours?period=custom&startDate=2031-10-07&endDate=2031-10-08');assert.equal(multi.totalCustomers,23);assert.deepEqual(multi.days.map(d=>d.date),['2031-10-07','2031-10-08']);assert.equal(multi.days[1].hours[0].customers,5);
 const uploadDay=await check('GET','/api/revenue/purchase-hours?period=custom&startDate=2031-10-10&endDate=2031-10-10');assert.equal(uploadDay.totalCustomers,0,'Do not count the delayed order again on upload day');
 const empty=await check('GET','/api/revenue/purchase-hours?period=custom&startDate=2035-01-01&endDate=2035-01-01');assert.equal(empty.totalCustomers,0);assert.equal(empty.days[0].hours.length,24);
 await check('GET','/api/revenue/purchase-hours?period=custom&startDate=2031-02-30&endDate=2031-03-01',undefined,400);await check('GET','/api/revenue/purchase-hours?period=custom&startDate=2031-10-08&endDate=2031-10-07',undefined,400);await check('GET','/api/revenue/purchase-hours?period=custom&startDate=2025-01-01&endDate=2031-10-07',undefined,400);
 assert.equal((await call('GET',url,undefined,'invalid-token')).response.status,401);
 // Restore fixtures so other business workflows do not inherit synthetic visits.
 await prisma.config.deleteMany({where:{storeId:'store',key:'receipts.pos.'+request.orderNumber}});await prisma.order.deleteMany({where:{orderNumber:{startsWith:prefix}}});
 console.log('PASS '+provider+' purchase hours: WIB boundaries, people vs orders, refund, fallback, store isolation, delayed upload, empty, invalid ranges and auth');
 return {passed:true,customers:data.totalCustomers,orders:data.totalOrders,peak:data.days[0].hours[12]};
};
