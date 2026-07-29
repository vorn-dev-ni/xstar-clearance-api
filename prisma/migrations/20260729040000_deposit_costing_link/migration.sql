-- Container-deposit sheet columns + BL-costing link (tracking-only deposits have no journal).

-- AlterTable: new columns
ALTER TABLE "Deposit"
  ADD COLUMN "shippingLine"      TEXT,
  ADD COLUMN "volume"            INTEGER,
  ADD COLUMN "refundedAmount"    DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refundRequestDate" TIMESTAMP(3),
  ADD COLUMN "sourceExpenseId"   TEXT;

-- Deposits created from BL costing carry no ledger account (no journal posting).
ALTER TABLE "Deposit" ALTER COLUMN "accountId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Deposit_sourceExpenseId_idx" ON "Deposit"("sourceExpenseId");
