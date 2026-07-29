-- CreateEnum: ShipmentType — marks whether a shipment carries bonded-warehouse goods.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ShipmentType') THEN
    CREATE TYPE "ShipmentType" AS ENUM ('INCLUDE_BONDED', 'EXCLUDE_BONDED');
  END IF;
END$$;

-- AlterTable: add shipmentType to ClearanceJob, backfilling existing rows to EXCLUDE_BONDED.
ALTER TABLE "ClearanceJob"
  ADD COLUMN IF NOT EXISTS "shipmentType" "ShipmentType" NOT NULL DEFAULT 'EXCLUDE_BONDED';
