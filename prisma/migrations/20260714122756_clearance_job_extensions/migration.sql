-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('COMMERCIAL_INVOICE', 'PACKING_LIST', 'BILL_OF_LADING', 'AIR_WAYBILL', 'CERTIFICATE_OF_ORIGIN', 'IMPORT_PERMIT', 'INSURANCE_CERTIFICATE', 'CUSTOMS_DECLARATION', 'OTHER');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('AIR', 'SEA', 'LAND', 'COURIER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('NEW', 'DOCS_COLLECTED', 'DECLARATION_SUBMITTED', 'CLEARED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ClearanceJob" ADD COLUMN     "assignedStaff" TEXT,
ADD COLUMN     "brokerName" TEXT,
ADD COLUMN     "consigneeDetails" TEXT,
ADD COLUMN     "destinationCountry" TEXT,
ADD COLUMN     "destinationPort" TEXT,
ADD COLUMN     "estimatedCost" DECIMAL(15,2),
ADD COLUMN     "estimatedRevenue" DECIMAL(15,2),
ADD COLUMN     "eta" TIMESTAMP(3),
ADD COLUMN     "goodsCurrency" TEXT,
ADD COLUMN     "goodsValue" DECIMAL(15,2),
ADD COLUMN     "incoterms" TEXT,
ADD COLUMN     "originCountry" TEXT,
ADD COLUMN     "originPort" TEXT,
ADD COLUMN     "shipperDetails" TEXT,
ADD COLUMN     "status" "JobStatus",
ADD COLUMN     "transportMode" "TransportMode";

-- AlterTable
ALTER TABLE "ExpenseRecord" ADD COLUMN     "clearanceJobId" TEXT;

-- AlterTable
ALTER TABLE "FileUpload" ADD COLUMN     "documentType" "DocumentType";

-- AlterTable
ALTER TABLE "IncomeRecord" ADD COLUMN     "clearanceJobId" TEXT;

-- CreateIndex
CREATE INDEX "ClearanceJob_status_idx" ON "ClearanceJob"("status");

-- CreateIndex
CREATE INDEX "ExpenseRecord_clearanceJobId_idx" ON "ExpenseRecord"("clearanceJobId");

-- CreateIndex
CREATE INDEX "IncomeRecord_clearanceJobId_idx" ON "IncomeRecord"("clearanceJobId");

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_clearanceJobId_fkey" FOREIGN KEY ("clearanceJobId") REFERENCES "ClearanceJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_clearanceJobId_fkey" FOREIGN KEY ("clearanceJobId") REFERENCES "ClearanceJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Back-fill workflow status from legacy free-text shipmentStatus
UPDATE "ClearanceJob" SET "status" = 'COMPLETED'
  WHERE "status" IS NULL AND UPPER(TRIM("shipmentStatus")) LIKE 'COMPLETED%';
UPDATE "ClearanceJob" SET "status" = 'CLEARED'
  WHERE "status" IS NULL AND UPPER(TRIM("shipmentStatus")) IN ('PASSED', 'CLEARED', 'DONE');
UPDATE "ClearanceJob" SET "status" = 'DECLARATION_SUBMITTED'
  WHERE "status" IS NULL AND UPPER(TRIM("shipmentStatus")) LIKE 'IN PROGRESS%';
UPDATE "ClearanceJob" SET "status" = 'DOCS_COLLECTED'
  WHERE "status" IS NULL AND UPPER(TRIM("shipmentStatus")) LIKE 'ARRIVED%';
UPDATE "ClearanceJob" SET "status" = 'NEW'
  WHERE "status" IS NULL AND UPPER(TRIM("shipmentStatus")) LIKE 'BOOKED%';
