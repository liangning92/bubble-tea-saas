// Disposable page-check server. Refuses production databases and binds loopback only.
import express from 'express'
import {writeFileSync} from 'fs'
import jwt from 'jsonwebtoken'
import prisma from '../src/config/database'
import {config} from '../src/config/env'
import {inventoryRouter} from '../src/routes/inventory'
import {purchaseOrderRouter} from '../src/routes/purchaseOrder'
import {inventoryCountRouter} from '../src/routes/inventoryCount'
import {supplierRouter} from '../src/routes/supplier'
import {staffPermissionsRouter} from '../src/routes/staffPermissions'
import {configRouter} from '../src/routes/config'
import {createPurchaseOrder} from '../src/services/PurchaseOrderService'
import {ensureInventoryFlow,FLOW_CUTOVER_KEY} from '../src/services/OrderConsumptionService'
import {checkConsumptionDay} from '../src/services/EmployeeConsumptionService'
import {randomUUID} from 'crypto'
async function main(){
 if(!process.env.DATABASE_URL?.includes('/bubble_inventory_flow_test?host=/tmp/bubble-inventory-flow-'))throw Error('Disposable database required')
 const tenant=await prisma.tenant.create({data:{name:'Synthetic page check'}}),store=await prisma.store.create({data:{tenantId:tenant.id,name:'Synthetic page check'}})
 const tea=await prisma.inventory.create({data:{storeId:store.id,name:'Jasmine tea (茉莉茶)',category:'Tea',unit:'kg',currentStock:10,avgCost:10000,safetyStock:2}})
 const milk=await prisma.inventory.create({data:{storeId:store.id,name:'Milk (牛奶)',category:'Milk',unit:'l',currentStock:1,avgCost:10000,safetyStock:2}})
 await prisma.config.create({data:{storeId:store.id,key:`inventoryPackage:${tea.id}`,value:JSON.stringify({unit:'bag',quantity:2,baseUnit:'kg'}),category:'inventory'}})
 await createPurchaseOrder({storeId:store.id,source:'online',onlineOrderNumber:'ONLINE-1001',items:[{inventoryId:tea.id,quantity:2,unitCost:20000,inputUnit:'bag'}]})
 await ensureInventoryFlow(store.id);await prisma.config.update({where:{storeId_key:{storeId:store.id,key:FLOW_CUTOVER_KEY}},data:{value:'2026-10-01T00:00:00+07:00'}})
 await prisma.orderConsumptionSnapshot.create({data:{storeId:store.id,orderId:randomUUID(),createdAt:new Date('2026-10-05T12:00:00+07:00'),materials:JSON.stringify([{inventoryId:tea.id,name:tea.name,unit:'kg',quantity:2}]),issues:'[]'}})
 await prisma.stockOutLog.create({data:{inventoryId:tea.id,reason:'withdrawal',quantity:3,createdAt:new Date('2026-10-05T12:00:00+07:00')}})
 await checkConsumptionDay(store.id,'2026-10-05',new Date('2026-10-06T12:00:00+07:00'))
 const credentials:any={storeId:store.id,teaId:tea.id,milkId:milk.id}
 for(const role of ['staff','admin']){
  const user=await prisma.user.create({data:{storeId:store.id,phone:randomUUID(),password:'synthetic',role}})
  const payload={id:user.id,phone:user.phone,role,storeId:store.id,staffId:'',issuedAtMs:Date.now()+1000}
  credentials[role]={user:{...payload,name:'Synthetic',position:'staff',staff:null},token:jwt.sign(payload,config.jwt.secret)}
 }
 const app=express();app.use(express.json());app.use('/api/inventory',inventoryRouter);app.use('/api/purchase-orders',purchaseOrderRouter);app.use('/api/inventory-counts',inventoryCountRouter);app.use('/api/suppliers',supplierRouter);app.use('/api/staff-permissions',staffPermissionsRouter);app.use('/api/config',configRouter)
 const server=app.listen(18072,'127.0.0.1',()=>{writeFileSync(process.env.INVENTORY_PAGE_FIXTURE!,JSON.stringify(credentials));console.log('Inventory page test API ready')})
 process.on('SIGTERM',()=>server.close(()=>void prisma.$disconnect().then(()=>process.exit(0))))
}
main().catch(e=>{console.error(e);process.exit(1)})
