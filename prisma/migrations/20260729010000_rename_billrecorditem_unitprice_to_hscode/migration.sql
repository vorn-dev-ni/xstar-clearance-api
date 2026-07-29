-- Rename BillRecordItem.unitPrice -> hsCode (data-preserving column rename).
-- The column keeps its Decimal(15,2) type and existing values; only the name changes.
ALTER TABLE "BillRecordItem" RENAME COLUMN "unitPrice" TO "hsCode";
