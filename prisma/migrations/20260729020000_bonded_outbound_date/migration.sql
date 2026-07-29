-- AlterTable: add manual Outbound Date to bonded-warehouse items.
-- Nullable/additive; existing rows keep NULL (day-count falls back to today).
ALTER TABLE "BondedWarehouseItem"
  ADD COLUMN IF NOT EXISTS "outboundDate" TIMESTAMP(3);
