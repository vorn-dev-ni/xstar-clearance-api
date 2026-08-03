-- Per-line tax + deposit on expense items so an operating-expense item mirrors a
-- B/L cost line. Nullable/additive; record-level totals are summed from these.
ALTER TABLE "ExpenseItem" ADD COLUMN IF NOT EXISTS "tax" DECIMAL(15,2);
ALTER TABLE "ExpenseItem" ADD COLUMN IF NOT EXISTS "deposit" DECIMAL(15,2);
