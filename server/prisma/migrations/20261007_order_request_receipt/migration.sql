-- Review artifact only. Back up and verify the target before approved deployment.
-- Historical rows stay NULL. No defaults, data updates, indexes or accounting changes.
BEGIN;
ALTER TABLE "Order" ADD COLUMN "requestFingerprint" TEXT;
ALTER TABLE "Order" ADD COLUMN "requestReceipt" TEXT;
COMMIT;
