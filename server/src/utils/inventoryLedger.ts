import {createHash} from 'crypto'
export const ledgerColumns=[['Inventory','ledgerSequence','BIGINT NOT NULL DEFAULT 0'],['Inventory','ledgerEpoch','BIGINT NOT NULL DEFAULT 0'],['StockInLog','ledgerSequence','BIGINT'],['StockOutLog','ledgerSequence','BIGINT']] as const
export const ledgerIndexes=['StockInLog','StockOutLog'].map(table=>`CREATE UNIQUE INDEX IF NOT EXISTS "${table}_inventoryId_ledgerSequence_key" ON "${table}"("inventoryId","ledgerSequence")`)
const fields:any={StockInLog:['inventoryId','quantity','unitCost','totalAmount','supplierId','staffId','batchId','note','createdAt'],StockOutLog:['inventoryId','quantity','reason','orderId','note','createdAt']}
export const sqliteLedgerTriggers=['StockInLog','StockOutLog'].flatMap(table=>[
 `CREATE TRIGGER "${table}_ledger_guard" BEFORE INSERT ON "${table}" WHEN NEW."ledgerSequence" IS NOT NULL BEGIN SELECT RAISE(ABORT,'LEDGER_SEQUENCE_SERVER_ONLY'); END`,
 `CREATE TRIGGER "${table}_ledger_insert" AFTER INSERT ON "${table}" BEGIN UPDATE "Inventory" SET "ledgerSequence"="ledgerSequence"+1 WHERE id=NEW."inventoryId"; UPDATE "${table}" SET "ledgerSequence"=(SELECT "ledgerSequence" FROM "Inventory" WHERE id=NEW."inventoryId") WHERE id=NEW.id; END`,
 `CREATE TRIGGER "${table}_ledger_update" AFTER UPDATE ON "${table}" WHEN ${fields[table].map((f:string)=>`OLD."${f}" IS NOT NEW."${f}"`).join(' OR ')} OR (OLD."ledgerSequence" IS NOT NULL AND OLD."ledgerSequence" IS NOT NEW."ledgerSequence") BEGIN UPDATE "Inventory" SET "ledgerEpoch"="ledgerEpoch"+1 WHERE id IN (OLD."inventoryId",NEW."inventoryId"); END`,
 `CREATE TRIGGER "${table}_ledger_delete" BEFORE DELETE ON "${table}" BEGIN UPDATE "Inventory" SET "ledgerEpoch"="ledgerEpoch"+1 WHERE id=OLD."inventoryId"; END`
])
export const pgLedgerFunction=`BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NEW."ledgerSequence" IS NOT NULL THEN RAISE EXCEPTION 'LEDGER_SEQUENCE_SERVER_ONLY'; END IF;
  UPDATE "Inventory" SET "ledgerSequence"="ledgerSequence"+1 WHERE id=NEW."inventoryId" RETURNING "ledgerSequence" INTO NEW."ledgerSequence";
  RETURN NEW;
 END IF;
 IF TG_OP = 'UPDATE' THEN
  IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  UPDATE "Inventory" SET "ledgerEpoch"="ledgerEpoch"+1 WHERE id IN (OLD."inventoryId",NEW."inventoryId");
  RETURN NEW;
 END IF;
 UPDATE "Inventory" SET "ledgerEpoch"="ledgerEpoch"+1 WHERE id=OLD."inventoryId";
 RETURN OLD;
END`
export const pgLedgerDDL=[...ledgerColumns.map(([table,column,type])=>`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${type}`),...ledgerIndexes,
 `CREATE OR REPLACE FUNCTION inventory_ledger_v1() RETURNS trigger LANGUAGE plpgsql AS $$${pgLedgerFunction}$$`,
 ...['StockInLog','StockOutLog'].flatMap(table=>[`CREATE TRIGGER "${table}_ledger_insert" BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION inventory_ledger_v1()`,`CREATE TRIGGER "${table}_ledger_mutate" BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION inventory_ledger_v1()`])]
export const ledgerChecksum=createHash('sha256').update(JSON.stringify({ledgerColumns,ledgerIndexes,sqliteLedgerTriggers})).digest('hex')
export async function assertLedgerInstalled(db:any,sqlite:boolean){
 if(sqlite){
  for(const table of ['StockInLog','StockOutLog']){const info=await db.$queryRawUnsafe(`PRAGMA index_info("${table}_inventoryId_ledgerSequence_key")`);if(info.map((i:any)=>i.name).join(',')!=='inventoryId,ledgerSequence')throw new Error('INVENTORY_LEDGER_MIGRATION_REQUIRED')}
  const actual=await db.$queryRawUnsafe("SELECT name,sql FROM sqlite_master WHERE type='trigger'")
  for(const sql of sqliteLedgerTriggers){const name=sql.match(/CREATE TRIGGER "([^"]+)"/)![1];if(!actual.some((t:any)=>t.name===name&&t.sql.trim()===sql))throw new Error('INVENTORY_LEDGER_MIGRATION_REQUIRED')}
 }else{
  const indexes=await db.$queryRawUnsafe("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema()")
  for(const table of ['StockInLog','StockOutLog'])if(!indexes.some((i:any)=>i.indexname===`${table}_inventoryId_ledgerSequence_key`&&i.indexdef.includes('UNIQUE INDEX')&&i.indexdef.includes('(\"inventoryId\", \"ledgerSequence\")')))throw new Error('INVENTORY_LEDGER_MIGRATION_REQUIRED')
  const fn=await db.$queryRawUnsafe("SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('inventory_ledger_v1()')")
  const triggers=await db.$queryRawUnsafe(`SELECT tgname,tgenabled,tgtype,tgrelid::regclass::text AS relation FROM pg_trigger WHERE tgfoid=to_regprocedure('inventory_ledger_v1()') AND NOT tgisinternal`)
  if(fn.length!==1||fn[0].prosrc!==pgLedgerFunction)throw new Error('INVENTORY_LEDGER_MIGRATION_REQUIRED')
  for(const table of ['StockInLog','StockOutLog'])for(const [suffix,type] of [['insert',7],['mutate',27]])if(!triggers.some((t:any)=>t.tgname===`${table}_ledger_${suffix}`&&t.tgenabled==='O'&&Number(t.tgtype)===type&&t.relation===`"${table}"`))throw new Error('INVENTORY_LEDGER_MIGRATION_REQUIRED')
 }
}
