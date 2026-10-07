import {afterAll,beforeAll,expect,jest,test} from '@jest/globals'
jest.mock('../src/services/ReferralService',()=>({processOrderReferralRewards:jest.fn(async()=>undefined)}))
jest.mock('@prisma/client',()=>{
 const actual=jest.requireActual(process.env.AUDIT_SQLITE_CLIENT!) as any
 return {...actual,PrismaClient:class extends actual.PrismaClient {
  constructor(options:any){super(options);((globalThis as any).__sqliteClients??=[]).push(this)}
 }}
})
jest.mock('../src/config/database',()=>{
 const {PrismaClient}=require('@prisma/client')
 return {__esModule:true,default:new PrismaClient({datasources:{db:{url:process.env.AUDIT_SQLITE_LOCAL}}})}
})
import {PrismaClient} from '@prisma/client'
import prisma from '../src/config/database'
import {createOrder,refundOrder,updateOrderStatus} from '../src/services/OrderService'
import {savePaymentEvidence,getPaymentEvidence} from '../src/services/PaymentEvidenceService'
import router from '../src/routes/sync'
const cloud=new PrismaClient()
let seq=0
import {upgradeLocalSqlite} from '../src/utils/sqliteUpgrade'
import {copyFile,readFile,readdir,mkdir,writeFile} from 'fs/promises'
import path from 'path'
let upgradeResult:Awaited<ReturnType<typeof upgradeLocalSqlite>>
beforeAll(async()=>{upgradeResult=await upgradeLocalSqlite(prisma,process.env.AUDIT_SQLITE_LOCAL!)})
afterAll(async()=>{for(const client of (globalThis as any).__sqliteClients)await client.$disconnect()})
async function fixture(){
 const key=`sqlite-${Date.now()}-${++seq}`
 const tenant=await prisma.tenant.create({data:{name:key}})
 const store=await prisma.store.create({data:{tenantId:tenant.id,name:key}})
 const category=await prisma.category.create({data:{storeId:store.id,name:'Tea'}})
 const product=await prisma.product.create({data:{storeId:store.id,categoryId:category.id,code:key,name:'Synthetic Tea'}})
 const spec=await prisma.spec.create({data:{productId:product.id,name:'Regular',price:100}})
 const inventory=await prisma.inventory.create({data:{storeId:store.id,name:'Synthetic ingredient',category:'tea',unit:'g',currentStock:100,avgCost:BigInt(100)}})
 await prisma.bOMItem.create({data:{productId:product.id,inventoryId:inventory.id,quantity:2,unit:'g'}})
 const request={storeId:store.id,staffId:'synthetic-a',orderNumber:key,paymentMethod:'cash',taxEnabled:false,items:[{productId:product.id,productName:'Synthetic Tea',specId:spec.id,specName:'Regular',quantity:1,unitPrice:100}]}
 return {key,tenant,store,category,product,spec,inventory,request}
}
test('real SQLite engine reads preserved migrated legacy data',async()=>{
 const version=await prisma.$queryRawUnsafe<Array<{version:string}>>('SELECT sqlite_version() AS version')
 expect(version[0].version).toMatch(/^3\./)
 const legacy=await prisma.order.findUniqueOrThrow({where:{id:'legacy-order'}})
 expect(legacy.finalAmount).toBe(100);expect(legacy.requestFingerprint).toBeNull()
 expect((await prisma.refundRequest.findUniqueOrThrow({where:{id:'legacy-refund'}})).reasonCode).toBe('legacy')
})
test('PostgreSQL-generated client rejects the desktop file URL before any connection',async()=>{
 const {PrismaClient:PgClient}=require(process.cwd()+'/server/node_modules/.prisma/client')
 const pg=new PgClient({datasources:{db:{url:process.env.AUDIT_SQLITE_LOCAL}}})
 try{await expect(pg.$connect()).rejects.toThrow(/postgresql|postgres/)}finally{await pg.$disconnect()}
})
test('SQLite photo bytes, point redemption, exact replay and same-store handover persist correctly',async()=>{
 const f=await fixture();const m=await prisma.member.create({data:{storeId:f.store.id,name:'Synthetic',phone:f.key,points:5000}})
 const image=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from(f.key)])
 const proof=await savePaymentEvidence(f.store.id,'a',50,image)
 const input={...f.request,memberId:m.id,pointsRedeemed:5000,paymentMethod:'qris',paymentEvidenceId:proof.id}
 const sale=await createOrder(input,{actorId:'a',storeId:f.store.id,allowCreate:true})
 const replay=await createOrder(input,{actorId:'b',storeId:f.store.id,allowCreate:false})
 expect(replay.id).toBe(sale.id);expect(replay.grandTotal).toBe(50)
 const stored=await getPaymentEvidence(proof.id,f.store.id)
 expect(stored!.image).toEqual(image);expect(stored!.confirmedBy).toBe('a')
 expect(await getPaymentEvidence(proof.id,'foreign')).toBeNull()
 expect((await prisma.member.findUniqueOrThrow({where:{id:m.id}})).points).toBe(0)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(98)
 await expect(prisma.order.delete({where:{id:sale.id}})).rejects.toThrow()
})
test('SQLite failed refund log rolls back all effects; prepared refund preserves consumed ingredients',async()=>{
 const f=await fixture();const sale=await createOrder(f.request)
 const m=await prisma.member.create({data:{storeId:f.store.id,name:'Synthetic',phone:f.key,points:100,totalSpent:100}})
 await prisma.order.update({where:{id:sale.id},data:{memberId:m.id}})
 await prisma.pointLog.create({data:{memberId:m.id,orderId:sale.id,type:'earn',points:100}})
 await prisma.$executeRawUnsafe(`CREATE TRIGGER audit_fail_refund BEFORE INSERT ON PointLog WHEN NEW.type='adjust' BEGIN SELECT RAISE(ABORT,'synthetic refund log failure'); END`)
 try{
  await expect(refundOrder(sale.id)).rejects.toThrow()
  expect((await prisma.member.findUniqueOrThrow({where:{id:m.id}})).points).toBe(100)
  expect((await prisma.order.findUniqueOrThrow({where:{id:sale.id}})).status).toBe('completed')
  expect(await prisma.cashEvent.count({where:{storeId:f.store.id,type:'cash_out'}})).toBe(0)
 }finally{await prisma.$executeRawUnsafe('DROP TRIGGER audit_fail_refund')}
 await expect(updateOrderStatus(sale.id,'refunded')).rejects.toThrow('ORDER_FINANCIAL_STATUS_PROTECTED')
 await refundOrder(sale.id)
 expect((await prisma.member.findUniqueOrThrow({where:{id:m.id}})).points).toBe(0)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(98)
})
test('diagnostic: local receipt succeeds, but sync receiver omits photo and replay metadata',async()=>{
 const f=await fixture();const image=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from(f.key)])
 const proof=await savePaymentEvidence(f.store.id,'a',100,image)
 const sale=await createOrder({...f.request,paymentMethod:'qris',paymentEvidenceId:proof.id},{actorId:'a',storeId:f.store.id,allowCreate:true})
 await cloud.tenant.create({data:{id:f.tenant.id,name:'Synthetic replica'}})
 await cloud.store.create({data:{id:f.store.id,tenantId:f.tenant.id,name:'Synthetic replica'}})
 await cloud.category.create({data:f.category})
 await cloud.product.create({data:f.product})
 await cloud.spec.create({data:f.spec})
 expect(await cloud.order.findUnique({where:{id:sale.id}})).toBeNull() // No sender in checkout.
 const receipt=await prisma.order.findUniqueOrThrow({where:{id:sale.id},include:{items:true,paymentEvidence:true}})
 const handler=(router as any).stack.find((entry:any)=>entry.route?.path==='/order').route.stack.at(-1).handle
 const invoke=async()=>{const res:any={statusCode:200,status(code:number){this.statusCode=code;return this},json(data:any){this.body=data;return this}};await handler({body:{order:JSON.parse(JSON.stringify(receipt))},user:{id:'synthetic',role:'manager',storeId:f.store.id}},res);return res}
 expect((await invoke()).statusCode).toBe(200)
 expect((await invoke()).statusCode).toBe(200)
 expect(await cloud.order.count({where:{id:sale.id}})).toBe(1)
 const replica=await cloud.order.findUniqueOrThrow({where:{id:sale.id},include:{paymentEvidence:true}})
 expect(replica.paymentEvidence).toBeNull();expect(replica.requestFingerprint).toBeNull();expect(replica.checkoutTaxAmount).toBeNull()
 expect(await cloud.paymentEvidence.count()).toBe(0)
 expect((await getPaymentEvidence(proof.id,f.store.id))!.image).toEqual(image)
})

import {registerSearchCases} from '../audit-support/searchCases'
registerSearchCases(prisma,'sqlite')

test('SQLite startup upgrade is backed up, versioned and repeatable',async()=>{
 expect(upgradeResult.applied).toBe(true)
 const backup=new PrismaClient({datasources:{db:{url:`file:${upgradeResult.backupPath}`}}})
 const old=await backup.$queryRawUnsafe<Array<{name:string}>>('PRAGMA table_info("Order")')
 expect(old.some(c=>c.name==='requestFingerprint')).toBe(false)
 const [row]=await backup.$queryRawUnsafe<Array<{finalAmount:number}>>(`SELECT finalAmount FROM "Order" WHERE id='legacy-order'`)
 expect(row.finalAmount).toBe(100)
 const before=await readdir(path.dirname(upgradeResult.backupPath!))
 expect((await upgradeLocalSqlite(prisma,process.env.AUDIT_SQLITE_LOCAL!)).applied).toBe(false)
 expect(await readdir(path.dirname(upgradeResult.backupPath!))).toEqual(before)
})
test('SQLite failure rolls back DDL and version together; backup remains and retry succeeds',async()=>{
 const file=path.join(process.env.AUDIT_SQLITE_ROOT!,'rollback.db')
 await copyFile(path.join(process.env.AUDIT_SQLITE_ROOT!,'before-migration.db'),file)
 const db=new PrismaClient({datasources:{db:{url:`file:${file}`}}})
 await db.$executeRawUnsafe('CREATE TABLE LocalSchemaMigration (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, backupPath TEXT NOT NULL, appliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)')
 await db.$executeRawUnsafe("CREATE TRIGGER fail_upgrade BEFORE INSERT ON LocalSchemaMigration BEGIN SELECT RAISE(ABORT,'synthetic migration failure'); END")
 await expect(upgradeLocalSqlite(db,`file:${file}`)).rejects.toThrow()
 expect((await db.$queryRawUnsafe<Array<{name:string}>>('PRAGMA table_info("Order")')).some(c=>c.name==='requestFingerprint')).toBe(false)
 expect(await db.$queryRawUnsafe('SELECT * FROM LocalSchemaMigration')).toEqual([])
 expect((await readdir(path.join(process.env.AUDIT_SQLITE_ROOT!,'upgrade-backups'))).some(n=>n.startsWith('rollback.db.'))).toBe(true)
 await db.$executeRawUnsafe('DROP TRIGGER fail_upgrade')
 expect((await upgradeLocalSqlite(db,`file:${file}`)).applied).toBe(true)
})
test('SQLite unknown migration version and backup failure refuse changes',async()=>{
 const file=path.join(process.env.AUDIT_SQLITE_ROOT!,'future.db')
 await copyFile(path.join(process.env.AUDIT_SQLITE_ROOT!,'before-migration.db'),file)
 const db=new PrismaClient({datasources:{db:{url:`file:${file}`}}})
 await db.$executeRawUnsafe('CREATE TABLE LocalSchemaMigration (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, backupPath TEXT NOT NULL, appliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)')
 await db.$executeRawUnsafe("INSERT INTO LocalSchemaMigration(version,checksum,backupPath) VALUES(99,'future','synthetic')")
 await expect(upgradeLocalSqlite(db,`file:${file}`)).rejects.toThrow('SQLITE_UPGRADE_UNKNOWN_VERSION')
 const directory=path.join(process.env.AUDIT_SQLITE_ROOT!,'blocked-backup');await mkdir(directory)
 const blocked=path.join(directory,'old.db');await copyFile(path.join(process.env.AUDIT_SQLITE_ROOT!,'before-migration.db'),blocked)
 await writeFile(path.join(directory,'upgrade-backups'),'synthetic obstruction')
 const db2=new PrismaClient({datasources:{db:{url:`file:${blocked}`}}})
 await expect(upgradeLocalSqlite(db2,`file:${blocked}`)).rejects.toThrow()
 expect((await db2.$queryRawUnsafe<Array<{name:string}>>('PRAGMA table_info("Order")')).some(c=>c.name==='requestFingerprint')).toBe(false)
})

test('administrator unprepared reversal uses original deductions after BOM edits, rolls back and is once-only',async()=>{
 const f=await fixture();const sale=await createOrder(f.request)
 await prisma.bOMItem.updateMany({where:{productId:f.product.id},data:{quantity:99}})
 const request=await prisma.refundRequest.create({data:{orderId:sale.id,reason:'Not prepared',reasonCode:'paid_unprepared',selectedItemIds:JSON.stringify(sale.items.map((i:any)=>i.id)),requestedBy:'cashier'}})
 const approval={requestId:request.id,approvedBy:'admin',restoreUnprepared:true}
 await prisma.$executeRawUnsafe("CREATE TRIGGER audit_fail_reversal BEFORE INSERT ON StockOutLog WHEN NEW.reason='refund_unprepared' BEGIN SELECT RAISE(ABORT,'synthetic reversal failure'); END")
 try{await expect(refundOrder(sale.id,'verified',undefined,undefined,approval)).rejects.toThrow();expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(98);expect((await prisma.refundRequest.findUniqueOrThrow({where:{id:request.id}})).status).toBe('pending')}
 finally{await prisma.$executeRawUnsafe('DROP TRIGGER audit_fail_reversal')}
 await refundOrder(sale.id,'verified',undefined,undefined,approval)
 expect((await prisma.inventory.findUniqueOrThrow({where:{id:f.inventory.id}})).currentStock).toBe(100)
 expect((await prisma.stockOutLog.findFirstOrThrow({where:{orderId:sale.id,reason:'refund_unprepared'}})).quantity).toBe(-2)
 await expect(refundOrder(sale.id,'retry',undefined,undefined,approval)).rejects.toThrow('ORDER_ALREADY_REFUNDED')
 expect(await prisma.stockOutLog.count({where:{orderId:sale.id,reason:'refund_unprepared'}})).toBe(1)
})

import {inventoryUnitContract} from '../audit-contracts/inventory-units'
inventoryUnitContract(prisma)

import {inventoryCostReview} from '../audit-contracts/inventory-cost-review'
inventoryCostReview(prisma)

import {orderNumberContract} from '../audit-contracts/order-number'
orderNumberContract(prisma)

import {inventoryCountContract} from '../audit-contracts/inventory-count'
inventoryCountContract(prisma)
import {countBoundaryContract} from '../audit-contracts/count-boundary'
countBoundaryContract(prisma)
import {ledgerWatermarkContract} from '../audit-contracts/ledger-watermark'
ledgerWatermarkContract(prisma)

test('v1 SQLite upgrades atomically to cursor v2 without assigning legacy log positions',async()=>{
 const fs=await import('fs/promises');const file=path.join(process.env.AUDIT_SQLITE_ROOT!,`v1-upgrade-${Date.now()}.db`)
 const db=new PrismaClient({datasources:{db:{url:`file:${file}`}}})
 try{
  const sql=await fs.readFile(path.join(process.env.AUDIT_SQLITE_ROOT!,'v1.sql'),'utf8')
  for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement)
  const {migrationChecksum}=await import('../src/utils/sqliteUpgrade')
  await db.$executeRawUnsafe('INSERT INTO LocalSchemaMigration(version,checksum,backupPath) VALUES (1,?,?)',migrationChecksum,'synthetic-v1-backup')
  await db.$executeRawUnsafe("INSERT INTO Tenant (id,name,updatedAt) VALUES ('v1t','Synthetic',CURRENT_TIMESTAMP)")
  await db.$executeRawUnsafe("INSERT INTO Store (id,tenantId,name,updatedAt) VALUES ('v1s','v1t','Synthetic',CURRENT_TIMESTAMP)")
  await db.$executeRawUnsafe("INSERT INTO Inventory (id,storeId,name,category,unit,currentStock,updatedAt) VALUES ('v1i','v1s','Tea','tea','kg',100,CURRENT_TIMESTAMP)")
  await db.$executeRawUnsafe("INSERT INTO StockOutLog(id,inventoryId,quantity,reason) VALUES ('v1log','v1i',1,'sold')")
  await db.$executeRawUnsafe("CREATE TRIGGER fail_v2 BEFORE INSERT ON LocalSchemaMigration WHEN NEW.version=2 BEGIN SELECT RAISE(ABORT,'SYNTHETIC_V2_FAILURE'); END")
  await expect(upgradeLocalSqlite(db,`file:${file}`)).rejects.toThrow('SYNTHETIC_V2_FAILURE')
  expect((await db.$queryRawUnsafe<any[]>('PRAGMA table_info("Inventory")')).some(c=>c.name==='ledgerSequence')).toBe(false)
  expect((await db.$queryRawUnsafe<any[]>('SELECT version FROM LocalSchemaMigration')).map(r=>Number(r.version))).toEqual([1])
  await db.$executeRawUnsafe('DROP TRIGGER fail_v2')
  expect((await upgradeLocalSqlite(db,`file:${file}`)).version).toBe(2)
  expect((await db.stockOutLog.findUniqueOrThrow({where:{id:'v1log'}})).ledgerSequence).toBeNull()
  await db.stockOutLog.create({data:{inventoryId:'v1i',quantity:2,reason:'sold'}})
  expect((await db.inventory.findUniqueOrThrow({where:{id:'v1i'}})).ledgerSequence).toBe(1n)
  expect((await db.$queryRawUnsafe<any[]>('SELECT version FROM LocalSchemaMigration ORDER BY version')).map(r=>Number(r.version))).toEqual([1,2])
 }finally{await db.$disconnect()}
})
