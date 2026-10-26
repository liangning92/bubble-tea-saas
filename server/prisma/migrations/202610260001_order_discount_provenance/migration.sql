-- Additive, re-runnable. Existing financial amounts and immutable receipts remain untouched.
BEGIN;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "activityDiscountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "couponDiscountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pointsDiscountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "manualDiscountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "activityId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "activityName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "activitySource" TEXT;
COMMIT;
