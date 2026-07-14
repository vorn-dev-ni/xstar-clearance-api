-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "chequePayableNote" TEXT,
ADD COLUMN     "khrExchangeRate" DECIMAL(10,2) NOT NULL DEFAULT 4100,
ADD COLUMN     "swiftCode" TEXT;
