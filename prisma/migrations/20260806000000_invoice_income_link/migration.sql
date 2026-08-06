-- CreateEnum
CREATE TYPE "IncomeSource" AS ENUM ('MANUAL', 'INVOICE');

-- AlterTable
ALTER TABLE "IncomeRecord" ADD COLUMN "source" "IncomeSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "invoiceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IncomeRecord_invoiceId_key" ON "IncomeRecord"("invoiceId");

-- CreateIndex
CREATE INDEX "IncomeRecord_invoiceId_idx" ON "IncomeRecord"("invoiceId");

-- AddForeignKey
ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
