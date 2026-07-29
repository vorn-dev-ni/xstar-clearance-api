-- New required (at app layer) Clearance Type on shipments. Column is nullable in
-- the DB; existing rows are backfilled to NORMAL_CLEARANCE.
CREATE TYPE "ClearanceType" AS ENUM ('NORMAL_CLEARANCE', 'LAMSAM_CLEARANCE');
ALTER TABLE "ClearanceJob" ADD COLUMN IF NOT EXISTS "clearanceType" "ClearanceType";
UPDATE "ClearanceJob" SET "clearanceType" = 'NORMAL_CLEARANCE' WHERE "clearanceType" IS NULL;
