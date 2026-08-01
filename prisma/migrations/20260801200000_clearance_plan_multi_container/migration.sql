-- A shipment may now carry many containers (clearance-plan rows), each linked to
-- one of the job's B/Ls. Drop the one-per-shipment unique constraint and add the
-- per-container Bill of Loading + Container/Truck Type fields.
ALTER TABLE "ClearancePlan"
  ADD COLUMN "blNumber" TEXT,
  ADD COLUMN "containerType" TEXT;

DROP INDEX IF EXISTS "ClearancePlan_clearanceJobId_key";

CREATE INDEX IF NOT EXISTS "ClearancePlan_clearanceJobId_idx" ON "ClearancePlan"("clearanceJobId");
