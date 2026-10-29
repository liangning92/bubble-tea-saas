ALTER TABLE "StockInLog" ADD COLUMN "occurredOn" DATE;
ALTER TABLE "StockOutLog" ADD COLUMN "occurredOn" DATE;
ALTER TABLE "PurchaseOrder" ADD COLUMN "purchasedOn" DATE;
CREATE INDEX "StockInLog_occurredOn_id_idx" ON "StockInLog" ("occurredOn", "id");
CREATE INDEX "StockOutLog_occurredOn_id_idx" ON "StockOutLog" ("occurredOn", "id");
CREATE INDEX "PurchaseOrder_storeId_purchasedOn_id_idx" ON "PurchaseOrder" ("storeId", "purchasedOn", "id");
