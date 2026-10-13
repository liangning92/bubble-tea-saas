-- Apply once to the confirmed PostgreSQL release after backup, before starting the new API.
BEGIN;

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_supplierId_fkey";

-- AlterTable
ALTER TABLE "StockInLog" ADD COLUMN     "operationId" TEXT,
ADD COLUMN     "purchaseOrderId" TEXT;

-- AlterTable
ALTER TABLE "StockOutLog" ADD COLUMN     "operationId" TEXT,
ADD COLUMN     "staffId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "onlineOrderNumber" TEXT,
ADD COLUMN     "receivedBy" TEXT,
ADD COLUMN     "requestFingerprint" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'admin',
ALTER COLUMN "supplierId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN     "inputQuantity" DOUBLE PRECISION,
ADD COLUMN     "inputUnit" TEXT,
ADD COLUMN     "inputUnitCost" INTEGER,
ADD COLUMN     "packageSnapshot" TEXT;

-- CreateTable
CREATE TABLE "OrderConsumptionSnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "materials" TEXT NOT NULL,
    "issues" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderConsumptionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumptionAlert" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumptionAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderConsumptionSnapshot_orderId_key" ON "OrderConsumptionSnapshot"("orderId");

-- CreateIndex
CREATE INDEX "OrderConsumptionSnapshot_storeId_createdAt_idx" ON "OrderConsumptionSnapshot"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsumptionAlert_storeId_status_businessDate_idx" ON "ConsumptionAlert"("storeId", "status", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumptionAlert_storeId_businessDate_inventoryId_key" ON "ConsumptionAlert"("storeId", "businessDate", "inventoryId");

-- CreateIndex
CREATE UNIQUE INDEX "StockInLog_operationId_key" ON "StockInLog"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "StockOutLog_operationId_key" ON "StockOutLog"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_requestId_key" ON "PurchaseOrder"("requestId");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;


COMMIT;
