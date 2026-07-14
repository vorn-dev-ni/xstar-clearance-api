-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ACCOUNTANT', 'MANAGER', 'STAFF', 'VIEWER');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'BANK');

-- CreateEnum
CREATE TYPE "AccountCategory" AS ENUM ('OPERATION_REVENUE', 'CUSTOMS_CLEARANCE_FEE', 'STORAGE_FEE', 'TRUCKING_SERVICE', 'BROKERAGE_FEE', 'INTEREST_INCOME', 'OTHER_REVENUE', 'TECHNICAL_OPERATIONS', 'DEPOSITS_PAID', 'HOSPITALITY_ENTERTAINMENT', 'RENTAL_SECURITY', 'CAR_RENTAL', 'OFFICE_SUPPLIES', 'CLEANING_SUPPLIES', 'INTERNET_EMAIL', 'DRINKING_WATER', 'MAINTENANCE_ENERGY', 'UTILITIES', 'NSSF_CONTRIBUTION', 'TAX_EXPENSE', 'WITHHOLDING_TAX', 'BANK_CHARGES', 'DEPRECIATION', 'BANK_ACCOUNT', 'RECEIVABLES', 'PAYABLES', 'INVENTORY', 'VAT_PAYABLE');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('CUSTOMS_CLEARANCE', 'STORAGE_FEE', 'LICENSE_FEE', 'TRUCKING_SERVICE', 'LOGISTICS_SERVICE', 'BONDED_WAREHOUSE', 'BROKERAGE_SERVICE', 'REFUND', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('TECHNICAL_OPERATIONS', 'DEPOSITS_PAID', 'HOSPITALITY', 'RENTAL', 'CAR_RENTAL', 'OFFICE_SUPPLIES', 'CLEANING_SUPPLIES', 'INTERNET', 'UTILITIES', 'NSSF_CONTRIBUTION', 'TAX_PAYMENT', 'WITHHOLDING_TAX', 'BANK_CHARGES', 'MAINTENANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVISION');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHECK', 'CREDIT_CARD', 'MOBILE_MONEY', 'CRYPTOCURRENCY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('ACTIVE', 'RELEASED', 'RETURNED', 'FORFEITED');

-- CreateEnum
CREATE TYPE "ReferenceType" AS ENUM ('INCOME', 'EXPENSE', 'INVOICE', 'PAYMENT', 'DEPOSIT', 'MANUAL_ENTRY', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED', 'ADJUSTED');

-- CreateEnum
CREATE TYPE "EntryLineType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('PROFIT_LOSS', 'BALANCE_SHEET', 'CASH_FLOW', 'INCOME_SUMMARY', 'EXPENSE_SUMMARY', 'CUSTOMER_SUMMARY', 'SUPPLIER_SUMMARY', 'TAX_SUMMARY');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'VIEW', 'EXPORT', 'APPROVE', 'REJECT', 'POST', 'VOID');

-- CreateEnum
CREATE TYPE "TaxFilingType" AS ENUM ('VAT', 'INCOME_TAX', 'WITHHOLDING_TAX', 'NSSF', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "FilingStatus" AS ENUM ('DRAFT', 'FILED', 'ACCEPTED', 'REJECTED', 'AMENDED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'POSTED', 'RECONCILED', 'CANCELLED', 'VOID');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "department" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameKh" TEXT,
    "nameCn" TEXT,
    "taxId" TEXT,
    "address" TEXT NOT NULL,
    "commune" TEXT,
    "district" TEXT,
    "province" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Cambodia',
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "contactPerson" TEXT,
    "paymentTerms" TEXT,
    "bankAccount" TEXT,
    "bankName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameKh" TEXT,
    "nameCn" TEXT,
    "taxId" TEXT,
    "address" TEXT NOT NULL,
    "commune" TEXT,
    "district" TEXT,
    "province" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Cambodia',
    "phone" TEXT,
    "email" TEXT,
    "contactPerson" TEXT,
    "paymentTerms" TEXT,
    "bankAccount" TEXT,
    "bankName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameKh" TEXT,
    "nameCn" TEXT,
    "type" "AccountType" NOT NULL,
    "category" "AccountCategory" NOT NULL,
    "subCategory" TEXT,
    "accountNumber" TEXT,
    "bankName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeRecord" (
    "id" TEXT NOT NULL,
    "recordNumber" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "invoiceNumber" TEXT,
    "billNumber" TEXT,
    "referenceNumber" TEXT,
    "accountId" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "containerCount" INTEGER,
    "quantity" INTEGER,
    "unitPrice" DECIMAL(15,2),
    "notes" TEXT,
    "attachmentUrl" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recordedDate" TIMESTAMP(3),

    CONSTRAINT "IncomeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseRecord" (
    "id" TEXT NOT NULL,
    "recordNumber" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "expenseType" "ExpenseType" NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "accountId" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceNumber" TEXT,
    "poNumber" TEXT,
    "referenceNumber" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvalDate" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "quantity" INTEGER,
    "unitCost" DECIMAL(15,2),
    "notes" TEXT,
    "attachmentUrl" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recordedDate" TIMESTAMP(3),

    CONSTRAINT "ExpenseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "customerId" TEXT NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "taxAmount" DECIMAL(15,2) NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "notes" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "taxIdNumber" TEXT,
    "issuedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "itemNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" "PaymentMethod" NOT NULL,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "referenceNumber" TEXT,
    "checkNumber" TEXT,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "depositNumber" TEXT NOT NULL,
    "depositDate" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "purpose" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "referenceType" "ReferenceType" NOT NULL,
    "referenceId" TEXT,
    "incomeRecordId" TEXT,
    "expenseRecordId" TEXT,
    "invoiceId" TEXT,
    "description" TEXT NOT NULL,
    "memo" TEXT,
    "status" "EntryStatus" NOT NULL DEFAULT 'POSTED',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "entryType" "EntryLineType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT,

    CONSTRAINT "JournalEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTerm" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "termDays" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "discount" DECIMAL(5,2),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PaymentTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialReport" (
    "id" TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "totalRevenue" DECIMAL(15,2),
    "totalExpenses" DECIMAL(15,2),
    "grossProfit" DECIMAL(15,2),
    "netProfit" DECIMAL(15,2),
    "totalAssets" DECIMAL(15,2),
    "totalLiabilities" DECIMAL(15,2),
    "totalEquity" DECIMAL(15,2),
    "generatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detailsJson" TEXT,

    CONSTRAINT "FinancialReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "changes" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxFilingRecord" (
    "id" TEXT NOT NULL,
    "filingType" "TaxFilingType" NOT NULL,
    "filingPeriod" TEXT NOT NULL,
    "taxableIncome" DECIMAL(15,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "taxAmount" DECIMAL(15,2) NOT NULL,
    "status" "FilingStatus" NOT NULL DEFAULT 'DRAFT',
    "filedDate" TIMESTAMP(3),
    "receiptNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxFilingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL,
    "companyNameEn" TEXT NOT NULL,
    "companyNameKh" TEXT,
    "companyNameCn" TEXT,
    "vatId" TEXT NOT NULL,
    "businessLicense" TEXT,
    "taxId" TEXT,
    "address" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fiscalYearStart" INTEGER NOT NULL DEFAULT 1,
    "defaultVatRate" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "defaultPaymentTerms" INTEGER NOT NULL DEFAULT 30,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_taxId_key" ON "Customer"("taxId");

-- CreateIndex
CREATE INDEX "Customer_taxId_idx" ON "Customer"("taxId");

-- CreateIndex
CREATE INDEX "Customer_code_idx" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_taxId_key" ON "Supplier"("taxId");

-- CreateIndex
CREATE INDEX "Supplier_taxId_idx" ON "Supplier"("taxId");

-- CreateIndex
CREATE INDEX "Supplier_code_idx" ON "Supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE INDEX "Account_type_idx" ON "Account"("type");

-- CreateIndex
CREATE INDEX "Account_category_idx" ON "Account"("category");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeRecord_recordNumber_key" ON "IncomeRecord"("recordNumber");

-- CreateIndex
CREATE INDEX "IncomeRecord_customerId_idx" ON "IncomeRecord"("customerId");

-- CreateIndex
CREATE INDEX "IncomeRecord_recordDate_idx" ON "IncomeRecord"("recordDate");

-- CreateIndex
CREATE INDEX "IncomeRecord_serviceType_idx" ON "IncomeRecord"("serviceType");

-- CreateIndex
CREATE INDEX "IncomeRecord_status_idx" ON "IncomeRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseRecord_recordNumber_key" ON "ExpenseRecord"("recordNumber");

-- CreateIndex
CREATE INDEX "ExpenseRecord_supplierId_idx" ON "ExpenseRecord"("supplierId");

-- CreateIndex
CREATE INDEX "ExpenseRecord_recordDate_idx" ON "ExpenseRecord"("recordDate");

-- CreateIndex
CREATE INDEX "ExpenseRecord_expenseType_idx" ON "ExpenseRecord"("expenseType");

-- CreateIndex
CREATE INDEX "ExpenseRecord_status_idx" ON "ExpenseRecord"("status");

-- CreateIndex
CREATE INDEX "ExpenseRecord_approvalStatus_idx" ON "ExpenseRecord"("approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");

-- CreateIndex
CREATE INDEX "Invoice_invoiceDate_idx" ON "Invoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLineItem_invoiceId_itemNumber_key" ON "InvoiceLineItem"("invoiceId", "itemNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentNumber_key" ON "Payment"("paymentNumber");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_paymentDate_idx" ON "Payment"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_depositNumber_key" ON "Deposit"("depositNumber");

-- CreateIndex
CREATE INDEX "Deposit_customerId_idx" ON "Deposit"("customerId");

-- CreateIndex
CREATE INDEX "Deposit_supplierId_idx" ON "Deposit"("supplierId");

-- CreateIndex
CREATE INDEX "Deposit_depositDate_idx" ON "Deposit"("depositDate");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_entryNumber_key" ON "JournalEntry"("entryNumber");

-- CreateIndex
CREATE INDEX "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_status_idx" ON "JournalEntry"("status");

-- CreateIndex
CREATE INDEX "JournalEntry_referenceType_idx" ON "JournalEntry"("referenceType");

-- CreateIndex
CREATE INDEX "JournalEntryLine_entryId_idx" ON "JournalEntryLine"("entryId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_accountId_idx" ON "JournalEntryLine"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTerm_customerId_termDays_key" ON "PaymentTerm"("customerId", "termDays");

-- CreateIndex
CREATE INDEX "FinancialReport_reportType_idx" ON "FinancialReport"("reportType");

-- CreateIndex
CREATE INDEX "FinancialReport_reportDate_idx" ON "FinancialReport"("reportDate");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaxFilingRecord_filingType_filingPeriod_key" ON "TaxFilingRecord"("filingType", "filingPeriod");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySettings_vatId_key" ON "CompanySettings"("vatId");

-- AddForeignKey
ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeRecord" ADD CONSTRAINT "IncomeRecord_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_incomeRecordId_fkey" FOREIGN KEY ("incomeRecordId") REFERENCES "IncomeRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_expenseRecordId_fkey" FOREIGN KEY ("expenseRecordId") REFERENCES "ExpenseRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTerm" ADD CONSTRAINT "PaymentTerm_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReport" ADD CONSTRAINT "FinancialReport_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
