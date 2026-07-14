-- AlterTable
ALTER TABLE "ClearanceJob" ADD COLUMN     "depositAmount" DECIMAL(15,2),
ADD COLUMN     "issueClearanceDate" TIMESTAMP(3),
ADD COLUMN     "totalAmount" DECIMAL(15,2);

-- CreateTable
CREATE TABLE "BillRecordItem" (
    "id" TEXT NOT NULL,
    "clearanceJobId" TEXT NOT NULL,
    "itemNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "BillRecordItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillExpenseItem" (
    "id" TEXT NOT NULL,
    "clearanceJobId" TEXT NOT NULL,
    "itemNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "BillExpenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillRecordItem_clearanceJobId_idx" ON "BillRecordItem"("clearanceJobId");

-- CreateIndex
CREATE INDEX "BillExpenseItem_clearanceJobId_idx" ON "BillExpenseItem"("clearanceJobId");

-- AddForeignKey
ALTER TABLE "BillRecordItem" ADD CONSTRAINT "BillRecordItem_clearanceJobId_fkey" FOREIGN KEY ("clearanceJobId") REFERENCES "ClearanceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillExpenseItem" ADD CONSTRAINT "BillExpenseItem_clearanceJobId_fkey" FOREIGN KEY ("clearanceJobId") REFERENCES "ClearanceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
