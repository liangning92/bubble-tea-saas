const assert=require('node:assert/strict');
module.exports=async({prisma,check,call,base,ownerToken})=>{
 const {normalizeTvConfig}=require('../../server/src/utils/tvScreenConfig.ts');
 const before=await check('GET','/api/marketing/tv-screen/config');assert.equal(before.enabled,false);assert.deepEqual(before.dailySpecials,[]);assert.ok(before.displayToken);
 let anonymous=await fetch(base+'/api/marketing/tv-screen/config');assert.equal(anonymous.status,401);
 const key=before.displayToken;
 assert.equal((await fetch(base+'/api/marketing/tv-screen/config?displayToken='+encodeURIComponent(key)+'&storeId=foreign')).status,403);
 assert.equal((await fetch(base+'/api/marketing/tv-screen/config?displayToken=invalid')).status,401);
 assert.equal((await fetch(base+'/api/marketing/tv-screen/config?displayToken='+encodeURIComponent(key))).status,200);
 assert.equal((await call('GET','/api/orders',undefined,key)).response.status,401,'TV key cannot read business orders');
 const category=await prisma.category.create({data:{storeId:'store',name:'TV synthetic'}});const product=await prisma.product.create({data:{storeId:'store',categoryId:category.id,name:'TV Tea',code:'TV-SYNTHETIC'}});
 const config=normalizeTvConfig({enabled:true,dailySpecials:[{dayOfWeek:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',weekday:'short'}).format(new Date())),productId:product.id,autoPrice:true,productName:'TV Tea',originalPrice:20000,specialPrice:12000,tag:'Monday',imageUrl:'/uploads/synthetic.png',description:''}],lottery:{enabled:true,triggerMinOrderAmount:50000,title:'Test',subtitle:'',prizes:[{id:'zero',name:'Never',code:'',color:'#FFFFFF',weight:0},{id:'one',name:'Tea',code:'TEA',color:'#FF0000',weight:1}]}});
 await check('POST','/api/marketing/tv-screen/config',config);
 const rules=await check('GET','/api/marketing/activity-prices');assert.ok(rules.some(rule=>rule.productId===product.id&&rule.price===12000));
 const spec=await prisma.spec.create({data:{productId:product.id,name:'Regular',price:20000}});
 const orderService=require('../../server/src/services/OrderService.ts');
 const sale={storeId:'store',staffId:'staff',channelName:'DINE_IN',paymentMethod:'cash',taxEnabled:false,items:[{productId:product.id,productName:product.name,specId:spec.id,specName:'Regular',quantity:1,unitPrice:20000,addons:[]}]};
 await assert.rejects(()=>orderService.createOrder(sale,{actorId:'owner',storeId:'store',allowCreate:true,validateActivityPricing:true}),/ACTIVITY_PRICE_CHANGED/);
 const pricedOrder=await orderService.createOrder({...sale,items:[{...sale.items[0],unitPrice:12000}]},{actorId:'owner',storeId:'store',allowCreate:true,validateActivityPricing:true});assert.equal(pricedOrder.finalAmount,12000);
 const invalid=structuredClone(config);invalid.dailySpecials[0].productId='foreign-product';await check('POST','/api/marketing/tv-screen/config',invalid,400);
 const zero=structuredClone(config);zero.lottery.prizes.forEach(p=>p.weight=0);await check('POST','/api/marketing/tv-screen/config',zero,400);
 await check('POST','/api/marketing/tv-screen/trigger-lottery',{orderAmount:999999},400);
 const order=await prisma.order.create({data:{storeId:'store',staffId:'staff',orderNumber:'TV-SYNTHETIC-LOTTERY',totalAmount:60000,finalAmount:60000,paymentMethod:'cash',status:'completed'}});
 const first=await check('POST','/api/marketing/tv-screen/trigger-lottery',{orderId:order.id});assert.equal(first.prizeIndex,1);
 const again=await call('POST','/api/marketing/tv-screen/trigger-lottery',{orderId:order.id});assert.equal(again.json.replayed,true);assert.deepEqual(again.json.data,first);
 await prisma.order.update({where:{id:order.id},data:{status:'suspended'}});await check('POST','/api/marketing/tv-screen/trigger-lottery',{orderId:order.id},400);
 await prisma.order.update({where:{id:order.id},data:{status:'completed',finalAmount:100}});assert.equal(await check('POST','/api/marketing/tv-screen/trigger-lottery',{orderId:order.id,orderAmount:999999}),null);
 const socketManager=require('../../server/src/socket.ts').default;const io=socketManager.initialize(baseServer());
 function baseServer(){return require('http').createServer()}
 const server=io.httpServer;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const socketUrl='http://127.0.0.1:'+server.address().port;const {io:connect}=require('socket.io-client');
 const socket=connect(socketUrl,{auth:{clientType:'tv',displayToken:key},transports:['websocket'],reconnection:false});
 try{await new Promise((resolve,reject)=>{socket.once('tv:connected',resolve);socket.once('connect_error',reject);setTimeout(()=>reject(Error('TV socket timeout')),3000).unref()});const active=[...io.sockets.sockets.values()][0];assert.ok(active.rooms.has('tv:store'));assert.ok(!active.rooms.has('store:store'));assert.equal(active.data.user.role,'display');const received=new Promise(resolve=>socket.once('tv:config:update',resolve));socketManager.emitTVConfigUpdate('store',config);assert.deepEqual((await received).data.mediaFiles,config.mediaFiles)}finally{socket.disconnect();await new Promise(resolve=>io.close(resolve))}
 console.log('PASS TV real HTTP/JWT/store isolation, actual completed-order eligibility, duplicate draw protection, zero weight and TV-only socket room');
 await prisma.config.deleteMany({where:{storeId:'store',OR:[{key:'tv_screen_marketing_config'},{key:{startsWith:'tv_lottery_order:'}}]}});
}
