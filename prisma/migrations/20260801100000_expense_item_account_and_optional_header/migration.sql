-- Move the expense account onto each line item; header account becomes optional.
ALTER TABLE "ExpenseRecord" ALTER COLUMN "accountId" DROP NOT NULL;

ALTER TABLE "ExpenseItem" ADD COLUMN "accountId" TEXT;

CREATE INDEX "ExpenseItem_accountId_idx" ON "ExpenseItem"("accountId");

ALTER TABLE "ExpenseItem"
  ADD CONSTRAINT "ExpenseItem_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
