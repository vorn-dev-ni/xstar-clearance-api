-- AlterTable: add patent fields to Customer (taxId already exists from init migration)
ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "patentNo" TEXT,
  ADD COLUMN IF NOT EXISTS "patentExpiryDate" TIMESTAMP(3);
