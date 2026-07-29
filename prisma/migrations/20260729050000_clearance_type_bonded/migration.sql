-- Step 1 of 2: add the new enum value. Postgres cannot use a freshly-added enum
-- value in the same transaction that adds it, so the data merge is in step 2.
ALTER TYPE "ClearanceType" ADD VALUE IF NOT EXISTS 'BONDED_CLEARANCE';
