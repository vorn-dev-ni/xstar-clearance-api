-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'PATENT';
ALTER TYPE "DocumentType" ADD VALUE 'YEARLY_VAT_PAYMENT';
ALTER TYPE "DocumentType" ADD VALUE 'REPRESENTATIVE_IMAGE';
ALTER TYPE "DocumentType" ADD VALUE 'MOC_DOCUMENT';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "location" TEXT,
ADD COLUMN     "registrationDate" TIMESTAMP(3),
ADD COLUMN     "remark" TEXT;
