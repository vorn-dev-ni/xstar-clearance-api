-- 1a. Reduce ShipmentTaxStatus to {PAY_VAT, DEBIT_NOTE_ONLY} and migrate existing data.
--     Non-PAY_VAT values (Dutiable / Tax exemption / Tax deposit) → DEBIT_NOTE_ONLY.
--     NULLs are preserved.
ALTER TYPE "ShipmentTaxStatus" RENAME TO "ShipmentTaxStatus_old";
CREATE TYPE "ShipmentTaxStatus" AS ENUM ('PAY_VAT', 'DEBIT_NOTE_ONLY');
ALTER TABLE "ClearanceJob"
  ALTER COLUMN "shipmentTaxStatus" TYPE "ShipmentTaxStatus"
  USING (
    CASE
      WHEN "shipmentTaxStatus" IS NULL THEN NULL
      WHEN "shipmentTaxStatus"::text = 'PAY_VAT' THEN 'PAY_VAT'
      ELSE 'DEBIT_NOTE_ONLY'
    END::"ShipmentTaxStatus"
  );
DROP TYPE "ShipmentTaxStatus_old";

-- 1b. Add the new VAT_CERTIFICATE document type.
--     NOTE: Postgres cannot use a newly-added enum value in the same transaction,
--     so the data migration of existing YEARLY_VAT_PAYMENT files lives in
--     migration_step2.sql and must be run as a SEPARATE execution after this commits.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'VAT_CERTIFICATE';
