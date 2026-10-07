import {ledgerColumns,ledgerIndexes,sqliteLedgerTriggers,ledgerChecksum,assertLedgerInstalled} from './inventoryLedger'
import { PrismaClient, Prisma } from '@prisma/client'
import { createHash, randomUUID } from 'crypto'
import { mkdir, open } from 'fs/promises'
import path from 'path'

const VERSION = 1
const additions = [
  ['Staff','baseSalary','INTEGER'], ['Order','requestReceipt','TEXT'], ['Order','requestFingerprint','TEXT'], ['Order','checkoutTaxAmount','INTEGER'], ['Order','pickupNumber','TEXT'],
  ['RefundRequest','reasonCode',"TEXT NOT NULL DEFAULT 'legacy'"],
  ['RefundRequest','selectedItemIds',"TEXT NOT NULL DEFAULT '[]'"]
] as const
const evidenceDDL = `CREATE TABLE IF NOT EXISTS "PaymentEvidence" (
 "id" TEXT NOT NULL PRIMARY KEY, "storeId" TEXT NOT NULL, "orderId" TEXT,
 "amount" INTEGER NOT NULL, "uploadedBy" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "confirmedBy" TEXT, "confirmedAt" DATETIME, "verification" TEXT NOT NULL DEFAULT 'unverified',
 "sha256" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "image" BLOB NOT NULL,
 FOREIGN KEY("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE)`
const indexes = [
 'CREATE UNIQUE INDEX IF NOT EXISTS "PaymentEvidence_orderId_key" ON "PaymentEvidence"("orderId")',
 'CREATE INDEX IF NOT EXISTS "PaymentEvidence_storeId_idx" ON "PaymentEvidence"("storeId")',
 'CREATE UNIQUE INDEX IF NOT EXISTS "PaymentEvidence_storeId_sha256_key" ON "PaymentEvidence"("storeId","sha256")',
 'CREATE INDEX IF NOT EXISTS "Order_pickupNumber_idx" ON "Order"("pickupNumber")'
]
export const migrationChecksum = createHash('sha256').update(JSON.stringify({VERSION,additions,evidenceDDL,indexes})).digest('hex')
const ledgerDDL = 'CREATE TABLE IF NOT EXISTS "LocalSchemaMigration" ("version" INTEGER NOT NULL PRIMARY KEY, "checksum" TEXT NOT NULL, "backupPath" TEXT NOT NULL, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)'
type Database = PrismaClient | Prisma.TransactionClient
async function columns(db:Database,table:string) {
 return db.$queryRawUnsafe<Array<{name:string;type:string}>>(`PRAGMA table_info("${table}")`)
}
async function checkBaseline(db:Database) {
 for(const model of Prisma.dmmf.datamodel.models){
  if(['LocalSchemaMigration','PaymentEvidence'].includes(model.name))continue
  const table=model.dbName||model.name
  const names=(await columns(db,table)).map(c=>c.name)
  for(const field of model.fields.filter(field=>field.kind!=='object')){
   const name=field.dbName||field.name
   if(!names.includes(name)&&![...additions,...ledgerColumns].some(([t,n])=>t===table&&n===name))throw new Error(`SQLITE_UPGRADE_UNSUPPORTED_BASELINE:${table}.${name}`)
  }
 }
}
async function integrity(db:Database) {
 const check=await db.$queryRawUnsafe<Array<{integrity_check:string}>>('PRAGMA integrity_check')
 if(check.length!==1||check[0].integrity_check!=='ok')throw new Error('SQLITE_UPGRADE_INTEGRITY_FAILED')
 if((await db.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check')).length)throw new Error('SQLITE_UPGRADE_FOREIGN_KEYS_FAILED')
}
async function verifyCurrent(db:Database) {
 for(const [table,name,type] of additions){
  const field=(await columns(db,table)).find(c=>c.name===name)
  if(!field||field.type.toUpperCase()!==type.split(' ')[0])throw new Error('SQLITE_UPGRADE_SCHEMA_DRIFT')
 }
 const expected=['id','storeId','orderId','amount','uploadedBy','createdAt','confirmedBy','confirmedAt','verification','sha256','mimeType','image']
 const actual=(await columns(db,'PaymentEvidence')).map(c=>c.name)
 if(expected.some(name=>!actual.includes(name)))throw new Error('SQLITE_UPGRADE_SCHEMA_DRIFT')
 const relation=await db.$queryRawUnsafe<Array<{table:string;from:string;to:string;on_delete:string}>>('PRAGMA foreign_key_list("PaymentEvidence")')
 if(!relation.some(fk=>fk.table==='Order'&&fk.from==='orderId'&&fk.to==='id'&&fk.on_delete==='RESTRICT'))throw new Error('SQLITE_UPGRADE_SCHEMA_DRIFT')
 for(const [table,index,unique,fields] of [['Order','Order_pickupNumber_idx',0,['pickupNumber']],['PaymentEvidence','PaymentEvidence_orderId_key',1,['orderId']],['PaymentEvidence','PaymentEvidence_storeId_idx',0,['storeId']],['PaymentEvidence','PaymentEvidence_storeId_sha256_key',1,['storeId','sha256']]] as const){
  const list=await db.$queryRawUnsafe<Array<{name:string;unique:number}>>(`PRAGMA index_list("${table}")`)
  const info=await db.$queryRawUnsafe<Array<{name:string}>>(`PRAGMA index_info("${index}")`)
  if(!list.some(item=>item.name===index&&Number(item.unique)===unique)||JSON.stringify(info.map(item=>item.name))!==JSON.stringify(fields))throw new Error('SQLITE_UPGRADE_SCHEMA_DRIFT')
 }
 await integrity(db)
}
/** Called before accepting traffic. Never mutates PostgreSQL or restores over a live DB. */
export async function upgradeLocalSqlite(db:PrismaClient,databaseUrl:string) {
 if(!databaseUrl.startsWith('file:'))return {applied:false,version:0}
 await checkBaseline(db)
 await integrity(db)
 const tables=await db.$queryRawUnsafe<Array<{name:string}>>("SELECT name FROM sqlite_master WHERE type='table' AND name='LocalSchemaMigration'")
 if(tables.length){
  const history=await db.$queryRawUnsafe<Array<{version:number;checksum:string}>>('SELECT version,checksum FROM "LocalSchemaMigration" ORDER BY version')
  if(history.some(row=>!((Number(row.version)===1&&row.checksum===migrationChecksum)||(Number(row.version)===2&&row.checksum===ledgerChecksum))))throw new Error('SQLITE_UPGRADE_UNKNOWN_VERSION')
  if(history.some(row=>Number(row.version)===2)){if(!history.some(row=>Number(row.version)===1))throw new Error('SQLITE_UPGRADE_UNKNOWN_VERSION');await verifyCurrent(db);await assertLedgerInstalled(db,true);return {applied:false,version:2}}
 }
 const databases=await db.$queryRawUnsafe<Array<{name:string;file:string}>>('PRAGMA database_list')
 const file=databases.find(row=>row.name==='main')?.file
 if(!file)throw new Error('SQLITE_UPGRADE_REQUIRES_FILE')
 const directory=path.join(path.dirname(file),'upgrade-backups')
 await mkdir(directory,{recursive:true,mode:0o700})
 const backupPath=path.join(directory,`${path.basename(file)}.v2.${randomUUID()}.db`)
 await db.$executeRawUnsafe('VACUUM INTO ?',backupPath)
 const handle=await open(backupPath,'r+');try{await handle.sync()}finally{await handle.close()}
 const backup=new PrismaClient({datasources:{db:{url:`file:${backupPath}`}}})
 try{await integrity(backup)}finally{await backup.$disconnect()}
 await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe(ledgerDDL) // acquire SQLite write lock before inspecting history again
  const history=await tx.$queryRawUnsafe<Array<{version:number;checksum:string}>>('SELECT version,checksum FROM "LocalSchemaMigration"')
  if(history.some(row=>!((Number(row.version)===1&&row.checksum===migrationChecksum)||(Number(row.version)===2&&row.checksum===ledgerChecksum))))throw new Error('SQLITE_UPGRADE_UNKNOWN_VERSION')
  if(history.some(row=>Number(row.version)===2)){await verifyCurrent(tx);await assertLedgerInstalled(tx,true);return}
  for(const [table,name,type] of additions){
   if(!(await columns(tx,table)).some(c=>c.name===name))await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${type}`)
  }
  await tx.$executeRawUnsafe(evidenceDDL)
  for(const sql of indexes)await tx.$executeRawUnsafe(sql)
  await verifyCurrent(tx)
  if(!history.some(row=>Number(row.version)===1))await tx.$executeRawUnsafe('INSERT INTO "LocalSchemaMigration" (version,checksum,backupPath) VALUES (?,?,?)',1,migrationChecksum,backupPath)
  for(const [table,name,type] of ledgerColumns){if(!(await columns(tx,table)).some(c=>c.name===name))await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${type}`)}
  for(const sql of ledgerIndexes)await tx.$executeRawUnsafe(sql)
  const installed=await tx.$queryRawUnsafe<Array<{name:string}>>("SELECT name FROM sqlite_master WHERE type='trigger'")
  for(const sql of sqliteLedgerTriggers){if(!installed.some(t=>t.name===sql.match(/CREATE TRIGGER "([^"]+)"/)![1]))await tx.$executeRawUnsafe(sql)}
  await assertLedgerInstalled(tx,true)
  await tx.$executeRawUnsafe('INSERT INTO "LocalSchemaMigration" (version,checksum,backupPath) VALUES (?,?,?)',2,ledgerChecksum,backupPath)
 },{timeout:60000})
 return {applied:true,version:2,backupPath}
}
