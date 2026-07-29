-- Fix drift: the Prisma schema declares Customer.taxId (TIN) @unique, but the live
-- DB never actually had this column. Add it + its unique index to match the schema.
-- (A unique index on a nullable column still permits multiple NULLs in Postgres.)
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "taxId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_taxId_key" ON "Customer"("taxId");
