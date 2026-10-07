-- Additive companion upgrade. Never backfill unknown receipt tax.
BEGIN;
-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN IF NOT EXISTS "ledgerEpoch" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "ledgerSequence" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "checkoutTaxAmount" INTEGER,
ADD COLUMN IF NOT EXISTS "requestFingerprint" TEXT,
ADD COLUMN IF NOT EXISTS "requestReceipt" TEXT;

-- AlterTable
ALTER TABLE "RefundRequest" ADD COLUMN IF NOT EXISTS "reasonCode" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN IF NOT EXISTS "selectedItemIds" TEXT NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "baseSalary" INTEGER;

-- AlterTable
ALTER TABLE "StockInLog" ADD COLUMN IF NOT EXISTS "ledgerSequence" BIGINT;

-- AlterTable
ALTER TABLE "StockOutLog" ADD COLUMN IF NOT EXISTS "ledgerSequence" BIGINT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PaymentEvidence" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT,
    "amount" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "verification" TEXT NOT NULL DEFAULT 'unverified',
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "image" BYTEA NOT NULL,

    CONSTRAINT "PaymentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LocalSchemaMigration" (
    "version" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "backupPath" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalSchemaMigration_pkey" PRIMARY KEY ("version")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentEvidence_orderId_key" ON "PaymentEvidence"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PaymentEvidence_storeId_idx" ON "PaymentEvidence"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentEvidence_storeId_sha256_key" ON "PaymentEvidence"("storeId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StockInLog_inventoryId_ledgerSequence_key" ON "StockInLog"("inventoryId", "ledgerSequence");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StockOutLog_inventoryId_ledgerSequence_key" ON "StockOutLog"("inventoryId", "ledgerSequence");

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PaymentEvidence_orderId_fkey') THEN ALTER TABLE "PaymentEvidence" ADD CONSTRAINT "PaymentEvidence_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;


-- Additive inventory watermark migration; apply after a verified PostgreSQL backup.

ALTER TABLE "Inventory" ADD COLUMN IF NOT EXISTS "ledgerSequence" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Inventory" ADD COLUMN IF NOT EXISTS "ledgerEpoch" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "StockInLog" ADD COLUMN IF NOT EXISTS "ledgerSequence" BIGINT;
ALTER TABLE "StockOutLog" ADD COLUMN IF NOT EXISTS "ledgerSequence" BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS "StockInLog_inventoryId_ledgerSequence_key" ON "StockInLog"("inventoryId","ledgerSequence");
CREATE UNIQUE INDEX IF NOT EXISTS "StockOutLog_inventoryId_ledgerSequence_key" ON "StockOutLog"("inventoryId","ledgerSequence");
CREATE OR REPLACE FUNCTION inventory_ledger_v1() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
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
END$$;
DROP TRIGGER IF EXISTS "StockInLog_ledger_insert" ON "StockInLog";
CREATE TRIGGER "StockInLog_ledger_insert" BEFORE INSERT ON "StockInLog" FOR EACH ROW EXECUTE FUNCTION inventory_ledger_v1();
DROP TRIGGER IF EXISTS "StockInLog_ledger_mutate" ON "StockInLog";
CREATE TRIGGER "StockInLog_ledger_mutate" BEFORE UPDATE OR DELETE ON "StockInLog" FOR EACH ROW EXECUTE FUNCTION inventory_ledger_v1();
DROP TRIGGER IF EXISTS "StockOutLog_ledger_insert" ON "StockOutLog";
CREATE TRIGGER "StockOutLog_ledger_insert" BEFORE INSERT ON "StockOutLog" FOR EACH ROW EXECUTE FUNCTION inventory_ledger_v1();
DROP TRIGGER IF EXISTS "StockOutLog_ledger_mutate" ON "StockOutLog";
CREATE TRIGGER "StockOutLog_ledger_mutate" BEFORE UPDATE OR DELETE ON "StockOutLog" FOR EACH ROW EXECUTE FUNCTION inventory_ledger_v1();


COMMIT;
