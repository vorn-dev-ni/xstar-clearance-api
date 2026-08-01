-- Enforce: a shipment (ClearanceJob) may be linked to at most one clearance plan.
-- NOTE: this CREATE UNIQUE INDEX fails if duplicate "clearanceJobId" rows already
-- exist — resolve any duplicates before deploying.
DROP INDEX IF EXISTS "ClearancePlan_clearanceJobId_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "ClearancePlan_clearanceJobId_key" ON "ClearancePlan"("clearanceJobId");
