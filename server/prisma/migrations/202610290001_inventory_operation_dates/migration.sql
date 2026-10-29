ALTER TABLE "StockInLog" ADD COLUMN "occurredOn" TIMESTAMP(3);
ALTER TABLE "StockOutLog" ADD COLUMN "occurredOn" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN "purchasedOn" TIMESTAMP(3);
CREATE INDEX "StockInLog_occurredOn_id_idx" ON "StockInLog" ("occurredOn", "id");
CREATE INDEX "StockOutLog_occurredOn_id_idx" ON "StockOutLog" ("occurredOn", "id");
CREATE INDEX "PurchaseOrder_storeId_purchasedOn_id_idx" ON "PurchaseOrder" ("storeId", "purchasedOn", "id");
