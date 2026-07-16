-- Remove the Deals / convert-to-job feature.
-- Reverses 20260715023004_deal_vendorpayment_invoice_job_links (Deal parts).

ALTER TABLE "ClearanceJob" DROP CONSTRAINT IF EXISTS "ClearanceJob_dealId_fkey";
DROP INDEX IF EXISTS "ClearanceJob_dealId_idx";
ALTER TABLE "ClearanceJob" DROP COLUMN IF EXISTS "dealId";
DROP TABLE IF EXISTS "Deal";
DROP TYPE IF EXISTS "DealStatus";
