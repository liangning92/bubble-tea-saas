import {test,expect} from '@jest/globals'
import {PrismaClient} from '@prisma/client'
import {execFileSync} from 'child_process'
import {readFileSync,existsSync} from 'fs'
import {randomUUID} from 'crypto'
import {upgradeLocalSqlite} from '../src/utils/sqliteUpgrade'
import {upgradeInventoryFlow} from '../src/utils/inventoryFlowUpgrade'
test('legacy SQLite upgrade backs up data, makes supplier optional and preserves order items on restart',async()=>{
 if(!process.env.DATABASE_URL!.startsWith('file:'))return
 const file=process.env.DATABASE_URL!.slice(5).replace('test.db',`legacy-${randomUUID()}.db`)
 execFileSync('python3',['-c',`import sqlite3,sys
c=sqlite3.connect(sys.argv[1]);c.executescript(open(sys.argv[2]).read());c.close()`,file,process.env.INVENTORY_FLOW_LEGACY_SQL||'/tmp/inventory-flow-legacy.sql'])
 const db=new PrismaClient({datasources:{db:{url:'file:'+file}}})
 try{
  const tenant=await db.tenant.create({data:{name:'Legacy synthetic'}}),store=await db.store.create({data:{tenantId:tenant.id,name:'Legacy synthetic'}})
  const inventory=await db.inventory.create({data:{storeId:store.id,name:'Legacy tea',category:'tea',unit:'kg',currentStock:42,avgCost:1000}})
  const supplier=await db.supplier.create({data:{storeId:store.id,name:'Legacy supplier'}})
  await db.$executeRawUnsafe('INSERT INTO "PurchaseOrder" (id,storeId,supplierId,orderNumber,status,totalAmount,updatedAt) VALUES (?,?,?,?,?,?,?)','legacy-po',store.id,supplier.id,'LEGACY-PO','pending',1000,new Date())
  await db.$executeRawUnsafe('INSERT INTO "PurchaseOrderItem" (id,purchaseOrderId,inventoryId,quantity,unitCost,receivedQty) VALUES (?,?,?,?,?,?)','legacy-item','legacy-po',inventory.id,1,1000,0)
  await upgradeLocalSqlite(db,'file:'+file);await upgradeInventoryFlow(db,'file:'+file)
  const rows=await db.$queryRawUnsafe<any[]>('SELECT backupPath FROM "LocalSchemaMigration" WHERE version=3');expect(rows).toHaveLength(1);expect(existsSync(rows[0].backupPath)).toBe(true)
  expect((await db.purchaseOrder.findUniqueOrThrow({where:{id:'legacy-po'},include:{items:true}})).items).toHaveLength(1)
  expect((await db.inventory.findUniqueOrThrow({where:{id:inventory.id}})).currentStock).toBe(42)
  const online=await db.purchaseOrder.create({data:{storeId:store.id,orderNumber:randomUUID(),status:'awaiting_receipt',source:'online'}});expect(online.supplierId).toBeNull()
  await upgradeLocalSqlite(db,'file:'+file);await upgradeInventoryFlow(db,'file:'+file)
  expect(await db.purchaseOrderItem.count({where:{purchaseOrderId:'legacy-po'}})).toBe(1)
  expect(await db.$queryRawUnsafe<any[]>('PRAGMA foreign_key_check')).toEqual([])
 }finally{await db.$disconnect()}
})
