-- Preserve stored totals; do not infer payments on historical purchase orders.
ALTER TABLE "Inventory" ALTER COLUMN "avgCost" TYPE DOUBLE PRECISION;
ALTER TABLE "StockInLog" ALTER COLUMN "unitCost" TYPE DOUBLE PRECISION;
ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "unitCost" TYPE DOUBLE PRECISION;
ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "inputUnitCost" TYPE DOUBLE PRECISION;
ALTER TABLE "Batch" ALTER COLUMN "unitCost" TYPE DOUBLE PRECISION;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "lineAmount" INTEGER;
ALTER TABLE "PurchaseOrder" ADD COLUMN "paidAt" TIMESTAMP(3);
