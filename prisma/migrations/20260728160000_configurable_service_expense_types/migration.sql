-- Convert ServiceType/ExpenseType from enums into accounting-managed config tables.
-- Record columns become TEXT (values preserved), then the enum types are dropped and
-- tables of the same name are created + seeded with the previous enum values.

-- 1. Preserve existing values: enum -> text
ALTER TABLE "IncomeRecord"  ALTER COLUMN "serviceType" TYPE TEXT USING "serviceType"::text;
ALTER TABLE "ExpenseRecord" ALTER COLUMN "expenseType" TYPE TEXT USING "expenseType"::text;

-- 2. Drop old enum types (types & tables share a namespace → drop before CREATE TABLE)
DROP TYPE "ServiceType";
DROP TYPE "ExpenseType";

-- 3. Config tables
CREATE TABLE "ServiceType" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceType_code_key" ON "ServiceType"("code");

CREATE TABLE "ExpenseType" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpenseType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExpenseType_code_key" ON "ExpenseType"("code");

-- 4. Seed with the previous enum values (idempotent)
INSERT INTO "ServiceType" ("id","code","name","sortOrder","updatedAt") VALUES
  (gen_random_uuid()::text, 'CUSTOMS_CLEARANCE', 'Customs Clearance', 1, now()),
  (gen_random_uuid()::text, 'STORAGE_FEE',       'Storage Fee',       2, now()),
  (gen_random_uuid()::text, 'LICENSE_FEE',       'License Fee',       3, now()),
  (gen_random_uuid()::text, 'TRUCKING_SERVICE',  'Trucking Service',  4, now()),
  (gen_random_uuid()::text, 'LOGISTICS_SERVICE', 'Logistics Service', 5, now()),
  (gen_random_uuid()::text, 'BONDED_WAREHOUSE',  'Bonded Warehouse',  6, now()),
  (gen_random_uuid()::text, 'BROKERAGE_SERVICE', 'Brokerage Service', 7, now()),
  (gen_random_uuid()::text, 'REFUND',            'Refund',            8, now()),
  (gen_random_uuid()::text, 'OTHER',             'Other',             9, now())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "ExpenseType" ("id","code","name","sortOrder","updatedAt") VALUES
  (gen_random_uuid()::text, 'TECHNICAL_OPERATIONS', 'Technical Operations', 1,  now()),
  (gen_random_uuid()::text, 'DEPOSITS_PAID',        'Deposits Paid',        2,  now()),
  (gen_random_uuid()::text, 'HOSPITALITY',          'Hospitality',          3,  now()),
  (gen_random_uuid()::text, 'RENTAL',               'Rental',               4,  now()),
  (gen_random_uuid()::text, 'CAR_RENTAL',           'Car Rental',           5,  now()),
  (gen_random_uuid()::text, 'OFFICE_SUPPLIES',      'Office Supplies',      6,  now()),
  (gen_random_uuid()::text, 'CLEANING_SUPPLIES',    'Cleaning Supplies',    7,  now()),
  (gen_random_uuid()::text, 'INTERNET',             'Internet',             8,  now()),
  (gen_random_uuid()::text, 'UTILITIES',            'Utilities',            9,  now()),
  (gen_random_uuid()::text, 'NSSF_CONTRIBUTION',    'NSSF Contribution',    10, now()),
  (gen_random_uuid()::text, 'TAX_PAYMENT',          'Tax Payment',          11, now()),
  (gen_random_uuid()::text, 'WITHHOLDING_TAX',      'Withholding Tax',      12, now()),
  (gen_random_uuid()::text, 'BANK_CHARGES',         'Bank Charges',         13, now()),
  (gen_random_uuid()::text, 'MAINTENANCE',          'Maintenance',          14, now()),
  (gen_random_uuid()::text, 'OTHER',                'Other',                15, now())
ON CONFLICT ("code") DO NOTHING;
