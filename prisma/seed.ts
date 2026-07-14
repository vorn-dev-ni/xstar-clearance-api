import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AccountCategory,
  AccountType,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// Load the env file matching NODE_ENV (the seed runs outside Nest's ConfigModule).
const nodeEnv = process.env.NODE_ENV ?? 'development';
try {
  process.loadEnvFile(path.resolve(__dirname, `..`, `.env.${nodeEnv}`));
} catch {
  // Fall back to the ambient environment.
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL as string),
});

/**
 * Standard chart of accounts for S.T STAR (see README "Account Chart"), plus a
 * VAT-payable liability used when finalizing invoices.
 */
const ACCOUNTS: Array<{
  code: string;
  nameEn: string;
  type: AccountType;
  category: AccountCategory;
}> = [
  // Revenue
  { code: '4001', nameEn: 'Operation Revenue', type: AccountType.REVENUE, category: AccountCategory.OPERATION_REVENUE },
  { code: '4002', nameEn: 'Storage Fee Income', type: AccountType.REVENUE, category: AccountCategory.STORAGE_FEE },
  { code: '4003', nameEn: 'License Fee Income', type: AccountType.REVENUE, category: AccountCategory.CUSTOMS_CLEARANCE_FEE },
  { code: '4004', nameEn: 'Trucking Service Income', type: AccountType.REVENUE, category: AccountCategory.TRUCKING_SERVICE },
  { code: '4005', nameEn: 'Brokerage/Interest Income', type: AccountType.REVENUE, category: AccountCategory.INTEREST_INCOME },
  // Expenses
  { code: '5001', nameEn: 'Technical & Operations', type: AccountType.EXPENSE, category: AccountCategory.TECHNICAL_OPERATIONS },
  { code: '5002', nameEn: 'Operations Deposits', type: AccountType.EXPENSE, category: AccountCategory.DEPOSITS_PAID },
  { code: '5003', nameEn: 'Hospitality & Entertainment', type: AccountType.EXPENSE, category: AccountCategory.HOSPITALITY_ENTERTAINMENT },
  { code: '5004', nameEn: 'Rental & Security', type: AccountType.EXPENSE, category: AccountCategory.RENTAL_SECURITY },
  { code: '5006', nameEn: 'Internet & Email', type: AccountType.EXPENSE, category: AccountCategory.INTERNET_EMAIL },
  { code: '5009', nameEn: 'Utilities', type: AccountType.EXPENSE, category: AccountCategory.UTILITIES },
  { code: '5010', nameEn: 'NSSF Contribution', type: AccountType.EXPENSE, category: AccountCategory.NSSF_CONTRIBUTION },
  { code: '5011', nameEn: 'Tax Expense', type: AccountType.EXPENSE, category: AccountCategory.TAX_EXPENSE },
  { code: '5012', nameEn: 'Withholding Tax', type: AccountType.EXPENSE, category: AccountCategory.WITHHOLDING_TAX },
  // Assets
  { code: '1100', nameEn: 'Bank Account - USD', type: AccountType.BANK, category: AccountCategory.BANK_ACCOUNT },
  { code: '1200', nameEn: 'Accounts Receivable', type: AccountType.ASSET, category: AccountCategory.RECEIVABLES },
  { code: '1400', nameEn: 'Prepaid Expenses', type: AccountType.ASSET, category: AccountCategory.INVENTORY },
  // Liabilities
  { code: '2100', nameEn: 'Accounts Payable', type: AccountType.LIABILITY, category: AccountCategory.PAYABLES },
  { code: '2200', nameEn: 'Deposits (Customer/Supplier)', type: AccountType.LIABILITY, category: AccountCategory.PAYABLES },
  { code: '2300', nameEn: 'VAT Payable', type: AccountType.LIABILITY, category: AccountCategory.VAT_PAYABLE },
];

async function main(): Promise<void> {
  // Chart of accounts — idempotent by unique `code`.
  for (const acc of ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: acc.code },
      update: {},
      create: acc,
    });
  }
  console.log(`Seeded ${ACCOUNTS.length} accounts`);

  // Bootstrap admin.
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@stlogistics.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password: passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      role: UserRole.ADMIN,
    },
  });
  console.log(`Seeded admin user: ${email}`);

  // Company settings — single row keyed by a stable VAT id.
  await prisma.companySettings.upsert({
    where: { vatId: 'K009-STAR-0001' },
    update: {},
    create: {
      companyNameEn: 'S.T STAR Logistics & Customs Clearance Service Co., Ltd',
      vatId: 'K009-STAR-0001',
      address: '#338, Street 1928, Phnom Penh',
      province: 'Phnom Penh',
      country: 'Cambodia',
      phone: '017-858-882',
      email: 'info@stlogistics.com',
      website: 'www.stlogistics.com',
    },
  });
  console.log('Seeded company settings');

  // Tax rates — 10% (default) and 20%. Idempotent by unique `rate`.
  const TAX_RATES = [
    { label: 'VAT 10%', rate: 10, isDefault: true },
    { label: 'VAT 20%', rate: 20, isDefault: false },
  ];
  for (const tr of TAX_RATES) {
    await prisma.taxRate.upsert({
      where: { rate: tr.rate },
      update: {},
      create: tr,
    });
  }
  console.log(`Seeded ${TAX_RATES.length} tax rates`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
