-- CreateEnum
CREATE TYPE "ContainerType" AS ENUM ('FCL', 'LCL', 'BREAK_BULK');

-- CreateEnum
CREATE TYPE "ShipmentMode" AS ENUM ('IMPORT', 'TEMPORARY_IMPORT', 'PRE_CLEARANCE_IMPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "ShipmentTaxStatus" AS ENUM ('DUTIABLE', 'TAX_EXEMPTION', 'PAY_VAT', 'TAX_DEPOSIT');

-- CreateEnum
CREATE TYPE "ContainerDepositStatus" AS ENUM ('EIR_DOCS_COLLECTED', 'SUBMITTED_TO_SHIPPING_LINE', 'AWAITING_DEPOSIT_REFUND', 'DEPOSIT_REFUNDED');

-- AlterEnum: JobStatus becomes the B/L lifecycle. Old generic values do not map
-- onto the new states, so any existing rows are reset to the first step.
BEGIN;
CREATE TYPE "JobStatus_new" AS ENUM ('DRAFT_BL_RECEIVED', 'FINAL_BL_RECEIVED', 'BL_VERIFIED', 'BL_SUBMITTED_FOR_CUSTOMS', 'CUSTOMS_DECLARATION_SUBMITTED', 'CUSTOMS_CLEARANCE_COMPLETED', 'CONTAINER_RELEASED', 'DELIVERY_COMPLETED', 'FILE_CLOSED');
ALTER TABLE "ClearanceJob" ALTER COLUMN "status" TYPE "JobStatus_new" USING (
  CASE
    WHEN "status" IS NULL THEN NULL
    ELSE 'DRAFT_BL_RECEIVED'::"JobStatus_new"
  END
);
ALTER TYPE "JobStatus" RENAME TO "JobStatus_old";
ALTER TYPE "JobStatus_new" RENAME TO "JobStatus";
DROP TYPE "public"."JobStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "ClearanceJob" ADD COLUMN     "containerType" "ContainerType",
ADD COLUMN     "deliveryTo" TEXT,
ADD COLUMN     "grossWeight" TEXT,
ADD COLUMN     "hsCode" TEXT,
ADD COLUMN     "importer" TEXT,
ADD COLUMN     "netWeight" TEXT,
ADD COLUMN     "packageCount" INTEGER,
ADD COLUMN     "returnEmptyTo" TEXT,
ADD COLUMN     "shipmentMode" "ShipmentMode",
ADD COLUMN     "shipmentTaxStatus" "ShipmentTaxStatus",
ADD COLUMN     "unloadingBy" TEXT,
ADD COLUMN     "vesselVoyage" TEXT;

-- AlterTable
ALTER TABLE "Deposit" ADD COLUMN     "clearanceJobId" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "ContainerDepositStatus" NOT NULL DEFAULT 'EIR_DOCS_COLLECTED';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bankAccountId" TEXT;

-- AlterTable
ALTER TABLE "VendorPayment" ADD COLUMN     "bankAccountId" TEXT;

-- DropEnum
DROP TYPE "DepositStatus";

-- CreateIndex
CREATE INDEX "Deposit_clearanceJobId_idx" ON "Deposit"("clearanceJobId");

-- CreateIndex
CREATE INDEX "Payment_bankAccountId_idx" ON "Payment"("bankAccountId");

-- CreateIndex
CREATE INDEX "VendorPayment_bankAccountId_idx" ON "VendorPayment"("bankAccountId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_clearanceJobId_fkey" FOREIGN KEY ("clearanceJobId") REFERENCES "ClearanceJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
