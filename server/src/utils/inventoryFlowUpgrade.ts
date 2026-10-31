import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { mkdir } from 'fs/promises';
import path from 'path';
import { ensureInventoryFlow } from '../services/OrderConsumptionService';
export const purchasePaymentAdditions = [["PurchaseOrder", "paidAt", "DATETIME"], ["PurchaseOrderItem", "lineAmount", "INTEGER"]] as const;
export const inventoryFlowModels = ["OrderConsumptionSnapshot", "ConsumptionAlert"] as const;
export const inventoryFlowAdditions = [["StockInLog", "operationId", "TEXT"], ["StockInLog", "purchaseOrderId", "TEXT"], ["StockOutLog", "operationId", "TEXT"], ["StockOutLog", "staffId", "TEXT"], ["PurchaseOrder", "requestId", "TEXT"], ["PurchaseOrder", "requestFingerprint", "TEXT"], ["PurchaseOrder", "source", "TEXT NOT NULL DEFAULT 'admin'"], ["PurchaseOrder", "onlineOrderNumber", "TEXT"], ["PurchaseOrder", "createdBy", "TEXT"], ["PurchaseOrder", "receivedBy", "TEXT"], ["PurchaseOrderItem", "inputQuantity", "REAL"], ["PurchaseOrderItem", "inputUnit", "TEXT"], ["PurchaseOrderItem", "inputUnitCost", "INTEGER"], ["PurchaseOrderItem", "packageSnapshot", "TEXT"]] as const;
const newTables = ["CREATE TABLE \"OrderConsumptionSnapshot\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"storeId\" TEXT NOT NULL,\n    \"orderId\" TEXT NOT NULL,\n    \"materials\" TEXT NOT NULL,\n    \"issues\" TEXT NOT NULL,\n    \"reversedAt\" DATETIME,\n    \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP\n);", "CREATE TABLE \"ConsumptionAlert\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"storeId\" TEXT NOT NULL,\n    \"inventoryId\" TEXT NOT NULL,\n    \"businessDate\" TEXT NOT NULL,\n    \"status\" TEXT NOT NULL,\n    \"detail\" TEXT NOT NULL,\n    \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" DATETIME NOT NULL\n);"];
const indexes = ["CREATE UNIQUE INDEX \"StockInLog_operationId_key\" ON \"StockInLog\"(\"operationId\");", "CREATE UNIQUE INDEX \"StockOutLog_operationId_key\" ON \"StockOutLog\"(\"operationId\");", "CREATE UNIQUE INDEX \"PurchaseOrder_requestId_key\" ON \"PurchaseOrder\"(\"requestId\");", "CREATE UNIQUE INDEX \"OrderConsumptionSnapshot_orderId_key\" ON \"OrderConsumptionSnapshot\"(\"orderId\");", "CREATE INDEX \"OrderConsumptionSnapshot_storeId_createdAt_idx\" ON \"OrderConsumptionSnapshot\"(\"storeId\", \"createdAt\");", "CREATE INDEX \"ConsumptionAlert_storeId_status_businessDate_idx\" ON \"ConsumptionAlert\"(\"storeId\", \"status\", \"businessDate\");", "CREATE UNIQUE INDEX \"ConsumptionAlert_storeId_businessDate_inventoryId_key\" ON \"ConsumptionAlert\"(\"storeId\", \"businessDate\", \"inventoryId\");"];
const purchaseTable = "CREATE TABLE \"PurchaseOrder\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"storeId\" TEXT NOT NULL,\n    \"supplierId\" TEXT,\n    \"orderNumber\" TEXT NOT NULL,\n    \"requestId\" TEXT,\n    \"requestFingerprint\" TEXT,\n    \"source\" TEXT NOT NULL DEFAULT 'admin',\n    \"onlineOrderNumber\" TEXT,\n    \"createdBy\" TEXT,\n    \"receivedBy\" TEXT,\n    \"status\" TEXT NOT NULL DEFAULT 'pending',\n    \"totalAmount\" INTEGER NOT NULL DEFAULT 0,\n    \"expectedDate\" DATETIME,\n    \"receivedDate\" DATETIME,\n    \"note\" TEXT,\n    \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" DATETIME NOT NULL,\n    CONSTRAINT \"PurchaseOrder_storeId_fkey\" FOREIGN KEY (\"storeId\") REFERENCES \"Store\" (\"id\") ON DELETE RESTRICT ON UPDATE CASCADE,\n    CONSTRAINT \"PurchaseOrder_supplierId_fkey\" FOREIGN KEY (\"supplierId\") REFERENCES \"Supplier\" (\"id\") ON DELETE SET NULL ON UPDATE CASCADE\n);";
export const inventoryFlowChecksum = createHash('sha256').update(JSON.stringify({ inventoryFlowAdditions, newTables, indexes, purchaseTable })).digest('hex');
/** Runs before traffic. Back up SQLite before the nullable-supplier table rebuild. */
export async function upgradeInventoryFlow(db: PrismaClient, databaseUrl: string) {
    if (databaseUrl.startsWith('file:')) {
        const history = await db.$queryRawUnsafe<any[]>('SELECT version,checksum FROM "LocalSchemaMigration" WHERE version=3');
        if (history.length && history[0].checksum !== inventoryFlowChecksum)
            throw Error('INVENTORY_FLOW_SCHEMA_DRIFT');
        if (!history.length) {
            const files = await db.$queryRawUnsafe<any[]>('PRAGMA database_list');
            const file = files.find(f => f.name === 'main')?.file;
            if (!file)
                throw Error('INVENTORY_FLOW_REQUIRES_FILE');
            const directory = path.join(path.dirname(file), 'upgrade-backups');
            await mkdir(directory, { recursive: true });
            const backup = path.join(directory, `${path.basename(file)}.inventory-flow.${randomUUID()}.db`);
            await db.$executeRawUnsafe('VACUUM INTO ?', backup);
            await db.$executeRawUnsafe('PRAGMA foreign_keys=OFF');
            try {
                await db.$transaction(async (tx) => {
                    for (const [table, name, type] of inventoryFlowAdditions) {
                        const columns = await tx.$queryRawUnsafe<any[]>(`PRAGMA table_info("${table}")`);
                        if (!columns.some(c => c.name === name))
                            await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${type}`);
                    }
                    const columns = await tx.$queryRawUnsafe<any[]>('PRAGMA table_info("PurchaseOrder")');
                    if (columns.find(c => c.name === 'supplierId')?.notnull) {
                        const foreignKeys = await tx.$queryRawUnsafe<any[]>('PRAGMA foreign_keys');
                        if (Number(foreignKeys[0]?.foreign_keys) !== 0)
                            throw Error('INVENTORY_FLOW_REBUILD_REQUIRES_FK_OFF');
                        await tx.$executeRawUnsafe(purchaseTable.replace('"PurchaseOrder"', '"__flow_PurchaseOrder"'));
                        // Preserve later nullable date fields already installed by desktop preflight.
                        // Keep the recorded v3 checksum stable for databases that have migrated.
                        for (const name of ['paidAt','purchasedOn']) {
                            if (columns.some(c => c.name === name)) await tx.$executeRawUnsafe(`ALTER TABLE "__flow_PurchaseOrder" ADD COLUMN "${name}" DATETIME`);
                        }
                        const fields = columns.map(c => `"${c.name}"`).join(',');
                        await tx.$executeRawUnsafe(`INSERT INTO "__flow_PurchaseOrder" (${fields}) SELECT ${fields} FROM "PurchaseOrder"`);
                        await tx.$executeRawUnsafe('DROP TABLE "PurchaseOrder"');
                        await tx.$executeRawUnsafe('ALTER TABLE "__flow_PurchaseOrder" RENAME TO "PurchaseOrder"');
                        await tx.$executeRawUnsafe('CREATE UNIQUE INDEX "PurchaseOrder_orderNumber_key" ON "PurchaseOrder"("orderNumber")');
                        if(columns.some(c=>c.name==='purchasedOn')) await tx.$executeRawUnsafe('CREATE INDEX "PurchaseOrder_storeId_purchasedOn_id_idx" ON "PurchaseOrder"("storeId","purchasedOn","id")');
                    }
                    for (const sql of newTables)
                        await tx.$executeRawUnsafe(sql.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
                    for (const sql of indexes)
                        await tx.$executeRawUnsafe(sql.replace('INDEX ', 'INDEX IF NOT EXISTS '));
                    if ((await tx.$queryRawUnsafe<any[]>('PRAGMA foreign_key_check')).length)
                        throw Error('INVENTORY_FLOW_FOREIGN_KEYS_FAILED');
                    await tx.$executeRawUnsafe('INSERT INTO "LocalSchemaMigration" (version,checksum,backupPath) VALUES (?,?,?)', 3, inventoryFlowChecksum, backup);
                }, { timeout: 60000 });
            }
            finally {
                await db.$executeRawUnsafe('PRAGMA foreign_keys=ON');
            }
        }
        const columns = await db.$queryRawUnsafe<any[]>('PRAGMA table_info("PurchaseOrder")');
        if (columns.find(c => c.name === 'supplierId')?.notnull)
            throw Error('INVENTORY_FLOW_SUPPLIER_NOT_NULL');
    }
    // SQLite retains numeric precision dynamically; these nullable columns preserve old orders.
    if(databaseUrl.startsWith('file:')){
        const orders=await db.$queryRawUnsafe<any[]>('PRAGMA table_info("PurchaseOrder")');
        if(!orders.some(c=>c.name==='paidAt'))await db.$executeRawUnsafe('ALTER TABLE "PurchaseOrder" ADD COLUMN "paidAt" DATETIME');
        const items=await db.$queryRawUnsafe<any[]>('PRAGMA table_info("PurchaseOrderItem")');
        if(!items.some(c=>c.name==='lineAmount'))await db.$executeRawUnsafe('ALTER TABLE "PurchaseOrderItem" ADD COLUMN "lineAmount" INTEGER');
    }
    // Fail startup before accepting sales if the deployment migration is missing.
    await db.orderConsumptionSnapshot.findFirst({ select: { id: true } });
    await db.consumptionAlert.findFirst({ select: { id: true } });
    await db.purchaseOrder.findFirst({ select: { id: true, source: true, requestId: true, receivedBy: true,paidAt:true } });
    await db.stockOutLog.findFirst({ select: { id: true, operationId: true, staffId: true } });
    if (!databaseUrl.startsWith('file:')) {
        const columns = await db.$queryRawUnsafe<any[]>(`SELECT is_nullable FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='PurchaseOrder' AND column_name='supplierId'`);
        if (columns[0]?.is_nullable !== 'YES')
            throw Error('INVENTORY_FLOW_MIGRATION_REQUIRED');
    }
    // PostgreSQL schema changes are applied explicitly by the deployment migration.
    const stores = await db.store.findMany({ select: { id: true } });
    for (const store of stores)
        await ensureInventoryFlow(store.id, db);
}
