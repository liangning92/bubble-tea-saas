-- Additive only: unknown history is never asserted to be drawer cash.
BEGIN;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "paymentSource" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "cashSessionId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "cashOccurredAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Expense_drawer_payment_idx" ON "Expense"("storeId","cashSessionId","cashOccurredAt");
COMMIT;
