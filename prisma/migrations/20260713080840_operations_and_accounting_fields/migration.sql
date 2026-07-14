-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('TAX_INVOICE', 'DEBIT_NOTE');

-- AlterTable
ALTER TABLE "ExpenseRecord" ADD COLUMN     "actualCost" DECIMAL(15,2),
ADD COLUMN     "deposit" DECIMAL(15,2),
ADD COLUMN     "taxAmount" DECIMAL(15,2),
ADD COLUMN     "taxRate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "IncomeRecord" ADD COLUMN     "balance" DECIMAL(15,2),
ADD COLUMN     "receivedFrom" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "invoiceType" "InvoiceType" NOT NULL DEFAULT 'TAX_INVOICE',
ADD COLUMN     "underCompanyTitle" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ClearanceJob" (
    "id" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shipmentStatus" TEXT,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT,
    "sizeVolume" TEXT,
    "invoiceNumber" TEXT,
    "blBookingNumber" TEXT,
    "incomeRecordId" TEXT,
    "commodity" TEXT,
    "portClearance" TEXT,
    "transaction" TEXT,
    "notice" TEXT,
    "contacts" TEXT,
    "other" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClearanceJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClearanceJob_jobNumber_key" ON "ClearanceJob"("jobNumber");

-- CreateIndex
CREATE INDEX "ClearanceJob_customerId_idx" ON "ClearanceJob"("customerId");

-- CreateIndex
CREATE INDEX "ClearanceJob_date_idx" ON "ClearanceJob"("date");

-- CreateIndex
CREATE INDEX "ClearanceJob_jobNumber_idx" ON "ClearanceJob"("jobNumber");

-- AddForeignKey
ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_receivedFrom_fkey" FOREIGN KEY ("receivedFrom") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceJob" ADD CONSTRAINT "ClearanceJob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceJob" ADD CONSTRAINT "ClearanceJob_incomeRecordId_fkey" FOREIGN KEY ("incomeRecordId") REFERENCES "IncomeRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
