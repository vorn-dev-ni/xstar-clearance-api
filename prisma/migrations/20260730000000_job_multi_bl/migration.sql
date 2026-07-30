-- AlterTable: a shipment can now carry multiple B/Ls (mostly 1, sometimes 2).
-- `blBookingNumber` stays as the primary (= blBookingNumbers[0]) for back-compat.
ALTER TABLE "ClearanceJob" ADD COLUMN "blBookingNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill existing rows from the single primary B/L.
UPDATE "ClearanceJob"
SET "blBookingNumbers" = ARRAY["blBookingNumber"]
WHERE "blBookingNumber" IS NOT NULL;
