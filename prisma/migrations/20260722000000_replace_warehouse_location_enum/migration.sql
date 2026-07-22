-- 1. Create the new WarehouseLocation table
CREATE TABLE "WarehouseLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseLocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WarehouseLocation_name_key" ON "WarehouseLocation"("name");

-- 2. Seed the table with existing enum values (hardcoded IDs map easily)
INSERT INTO "WarehouseLocation" ("id", "name", "isActive", "createdAt", "updatedAt") VALUES
  ('loc_kwb', 'KWB', true, NOW(), NOW()),
  ('loc_showroom', 'SHOWROOM', true, NOW(), NOW()),
  ('loc_released', 'RELEASED', true, NOW(), NOW()),
  ('loc_other', 'OTHER', true, NOW(), NOW());

-- 3. Add the new relation columns (allowing NULL temporarily if needed)
ALTER TABLE "BondedWarehouseItem" ADD COLUMN "currentLocationId" TEXT;
ALTER TABLE "BondedWarehouseMovement" ADD COLUMN "fromLocationId" TEXT;
ALTER TABLE "BondedWarehouseMovement" ADD COLUMN "toLocationId" TEXT;

-- 4. Map the existing enum data over to the new relation columns
UPDATE "BondedWarehouseItem" SET "currentLocationId" = 'loc_kwb' WHERE "currentLocation" = 'KWB';
UPDATE "BondedWarehouseItem" SET "currentLocationId" = 'loc_showroom' WHERE "currentLocation" = 'SHOWROOM';
UPDATE "BondedWarehouseItem" SET "currentLocationId" = 'loc_released' WHERE "currentLocation" = 'RELEASED';
UPDATE "BondedWarehouseItem" SET "currentLocationId" = 'loc_other' WHERE "currentLocation" = 'OTHER';

UPDATE "BondedWarehouseMovement" SET "fromLocationId" = 'loc_kwb' WHERE "fromLocation" = 'KWB';
UPDATE "BondedWarehouseMovement" SET "fromLocationId" = 'loc_showroom' WHERE "fromLocation" = 'SHOWROOM';
UPDATE "BondedWarehouseMovement" SET "fromLocationId" = 'loc_released' WHERE "fromLocation" = 'RELEASED';
UPDATE "BondedWarehouseMovement" SET "fromLocationId" = 'loc_other' WHERE "fromLocation" = 'OTHER';

UPDATE "BondedWarehouseMovement" SET "toLocationId" = 'loc_kwb' WHERE "toLocation" = 'KWB';
UPDATE "BondedWarehouseMovement" SET "toLocationId" = 'loc_showroom' WHERE "toLocation" = 'SHOWROOM';
UPDATE "BondedWarehouseMovement" SET "toLocationId" = 'loc_released' WHERE "toLocation" = 'RELEASED';
UPDATE "BondedWarehouseMovement" SET "toLocationId" = 'loc_other' WHERE "toLocation" = 'OTHER';

-- 5. Drop the old enum columns and the enum type from PostgreSQL entirely
ALTER TABLE "BondedWarehouseItem" DROP COLUMN "currentLocation";
ALTER TABLE "BondedWarehouseMovement" DROP COLUMN "fromLocation";
ALTER TABLE "BondedWarehouseMovement" DROP COLUMN "toLocation";

DROP TYPE "BondedItemLocation";

-- 6. Add Foreign Key constraints and Indexes for the new columns
ALTER TABLE "BondedWarehouseItem" ADD CONSTRAINT "BondedWarehouseItem_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "WarehouseLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BondedWarehouseMovement" ADD CONSTRAINT "BondedWarehouseMovement_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "WarehouseLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BondedWarehouseMovement" ADD CONSTRAINT "BondedWarehouseMovement_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "WarehouseLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BondedWarehouseItem_currentLocationId_idx" ON "BondedWarehouseItem"("currentLocationId");
CREATE INDEX "BondedWarehouseMovement_fromLocationId_idx" ON "BondedWarehouseMovement"("fromLocationId");
CREATE INDEX "BondedWarehouseMovement_toLocationId_idx" ON "BondedWarehouseMovement"("toLocationId");
