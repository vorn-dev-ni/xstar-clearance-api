-- Convert ClearanceJob.containerType from the ContainerType enum to free text.
-- Existing enum values (FCL / LCL / BREAK_BULK) are preserved as their string form.
ALTER TABLE "ClearanceJob"
  ALTER COLUMN "containerType" TYPE TEXT USING "containerType"::TEXT;

-- The enum is no longer referenced by any column; drop it.
DROP TYPE "ContainerType";
