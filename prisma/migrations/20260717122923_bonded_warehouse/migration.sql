-- CreateEnum
CREATE TYPE "BondedItemLocation" AS ENUM ('KWB', 'SHOWROOM', 'RELEASED', 'OTHER');

-- CreateEnum
CREATE TYPE "BondedDutyStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateEnum
CREATE TYPE "BondedMovementType" AS ENUM ('TRANSFER', 'LOCATION_UPDATE', 'RELEASE');

-- CreateTable
CREATE TABLE "BondedWarehouseItem" (
    "id" TEXT NOT NULL,
    "clearanceJobId" TEXT,
    "importerName" TEXT,
    "shipperName" TEXT,
    "blNumber" TEXT NOT NULL,
    "invoicePackingNumber" TEXT,
    "portOfLoading" TEXT,
    "portOfDischarge" TEXT,
    "containerTruckNumber" TEXT,
    "containerTruckType" TEXT,
    "brandName" TEXT,
    "description" TEXT,
    "engineCapacity" TEXT,
    "modelYear" INTEGER,
    "color" TEXT,
    "countryOrigin" TEXT,
    "vin" TEXT,
    "engineNumber" TEXT,
    "commodityCode" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "grossWeightKg" DECIMAL(15,3),
    "receivedDateKwb" TIMESTAMP(3),
    "currentLocation" "BondedItemLocation" NOT NULL DEFAULT 'KWB',
    "releasedQty" INTEGER NOT NULL DEFAULT 0,
    "stockBalance" INTEGER NOT NULL DEFAULT 1,
    "dutyStatus" "BondedDutyStatus" NOT NULL DEFAULT 'UNPAID',
    "validDays" INTEGER,
    "etaDate" TIMESTAMP(3),
    "sadIdIm8" TEXT,
    "transitDate" TIMESTAMP(3),
    "sadIdIm7" TEXT,
    "inboundDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BondedWarehouseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BondedWarehouseMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "BondedMovementType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "fromLocation" "BondedItemLocation",
    "toLocation" "BondedItemLocation",
    "dutyPaid" BOOLEAN NOT NULL DEFAULT false,
    "sadId" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BondedWarehouseMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BondedWarehouseItem_clearanceJobId_idx" ON "BondedWarehouseItem"("clearanceJobId");

-- CreateIndex
CREATE INDEX "BondedWarehouseItem_blNumber_idx" ON "BondedWarehouseItem"("blNumber");

-- CreateIndex
CREATE INDEX "BondedWarehouseItem_vin_idx" ON "BondedWarehouseItem"("vin");

-- CreateIndex
CREATE INDEX "BondedWarehouseItem_currentLocation_idx" ON "BondedWarehouseItem"("currentLocation");

-- CreateIndex
CREATE INDEX "BondedWarehouseItem_dutyStatus_idx" ON "BondedWarehouseItem"("dutyStatus");

-- CreateIndex
CREATE INDEX "BondedWarehouseItem_receivedDateKwb_idx" ON "BondedWarehouseItem"("receivedDateKwb");

-- CreateIndex
CREATE INDEX "BondedWarehouseMovement_itemId_idx" ON "BondedWarehouseMovement"("itemId");

-- CreateIndex
CREATE INDEX "BondedWarehouseMovement_date_idx" ON "BondedWarehouseMovement"("date");

-- AddForeignKey
ALTER TABLE "BondedWarehouseItem" ADD CONSTRAINT "BondedWarehouseItem_clearanceJobId_fkey" FOREIGN KEY ("clearanceJobId") REFERENCES "ClearanceJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BondedWarehouseMovement" ADD CONSTRAINT "BondedWarehouseMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "BondedWarehouseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
