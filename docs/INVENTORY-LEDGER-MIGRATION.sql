-- Additive inventory watermark migration; apply after a verified PostgreSQL backup.
BEGIN;
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
