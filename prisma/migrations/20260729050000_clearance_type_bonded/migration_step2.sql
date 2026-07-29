-- Step 2 of 2 (run AFTER step 1 commits): merge shipmentType into clearanceType,
-- then drop shipmentType. Bonded shipments become BONDED_CLEARANCE (bonded wins).
UPDATE "ClearanceJob" SET "clearanceType" = 'BONDED_CLEARANCE' WHERE "shipmentType" = 'INCLUDE_BONDED';
UPDATE "ClearanceJob" SET "clearanceType" = 'NORMAL_CLEARANCE' WHERE "clearanceType" IS NULL;
ALTER TABLE "ClearanceJob" DROP COLUMN IF EXISTS "shipmentType";
DROP TYPE IF EXISTS "ShipmentType";
