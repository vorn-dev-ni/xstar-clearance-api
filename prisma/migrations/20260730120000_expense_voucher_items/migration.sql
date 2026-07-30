-- Payment-voucher header fields on ExpenseRecord
ALTER TABLE "ExpenseRecord"
  ADD COLUMN "purpose"       TEXT,
  ADD COLUMN "accountNumber" TEXT,
  ADD COLUMN "accountName"   TEXT,
  ADD COLUMN "cashAdvance"   DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "note"          TEXT;

-- Voucher line items (Item No · A/C Code · Date · Invoice No · Description · Amount)
CREATE TABLE "ExpenseItem" (
  "id"              TEXT NOT NULL,
  "expenseRecordId" TEXT NOT NULL,
  "itemNumber"      INTEGER NOT NULL,
  "acCode"          TEXT,
  "itemDate"        TIMESTAMP(3),
  "invoiceNumber"   TEXT,
  "description"     TEXT NOT NULL,
  "amount"          DECIMAL(15,2) NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExpenseItem_expenseRecordId_idx" ON "ExpenseItem"("expenseRecordId");

ALTER TABLE "ExpenseItem"
  ADD CONSTRAINT "ExpenseItem_expenseRecordId_fkey"
  FOREIGN KEY ("expenseRecordId") REFERENCES "ExpenseRecord"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
