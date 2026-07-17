import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AccountCategory,
  AccountType,
  ApprovalStatus,
  ExpenseType,
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  ServiceType,
  TransactionStatus,
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
  // Assets — bank accounts
  { code: '1100', nameEn: 'ABA Business Account (VAT)', type: AccountType.BANK, category: AccountCategory.BANK_ACCOUNT },
  { code: '1110', nameEn: 'ABA Personal Account (No Tax)', type: AccountType.BANK, category: AccountCategory.BANK_ACCOUNT },
  { code: '1200', nameEn: 'Accounts Receivable', type: AccountType.ASSET, category: AccountCategory.RECEIVABLES },
  { code: '1210', nameEn: 'Container Deposits', type: AccountType.ASSET, category: AccountCategory.DEPOSITS_PAID },
  { code: '1400', nameEn: 'Prepaid Expenses', type: AccountType.ASSET, category: AccountCategory.INVENTORY },
  // Liabilities
  { code: '2100', nameEn: 'Accounts Payable', type: AccountType.LIABILITY, category: AccountCategory.PAYABLES },
  { code: '2200', nameEn: 'Deposits (Customer/Supplier)', type: AccountType.LIABILITY, category: AccountCategory.PAYABLES },
  { code: '2300', nameEn: 'VAT Payable', type: AccountType.LIABILITY, category: AccountCategory.VAT_PAYABLE },
];

async function main(): Promise<void> {
  // 1. Chart of accounts — idempotent by unique `code`.
  const accountsMap: Record<string, string> = {};
  for (const acc of ACCOUNTS) {
    const created = await prisma.account.upsert({
      where: { code: acc.code },
      update: { nameEn: acc.nameEn, type: acc.type, category: acc.category },
      create: acc,
    });
    accountsMap[acc.code] = created.id;
  }
  console.log(`✅ Seeded ${ACCOUNTS.length} accounts`);

  // 2. Bootstrap admin and demo users with varied roles.
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@stlogistics.com';
  const defaultPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  const USERS = [
    {
      email: adminEmail,
      firstName: 'System',
      lastName: 'Administrator',
      role: UserRole.SUPER_ADMIN,
      department: 'Executive Management',
      phone: '017-858-882',
    },
    {
      email: 'sokha.chan@stlogistics.com',
      firstName: 'Sokha',
      lastName: 'Chan',
      role: UserRole.ACCOUNTING,
      department: 'Finance & Accounting',
      phone: '012-345-678',
    },
    {
      email: 'virak.prom@stlogistics.com',
      firstName: 'Virak',
      lastName: 'Prom',
      role: UserRole.OPERATION,
      department: 'Operations & Clearance',
      phone: '017-889-990',
    },
    {
      email: 'dara.seng@stlogistics.com',
      firstName: 'Dara',
      lastName: 'Seng',
      role: UserRole.OPERATION,
      department: 'Customs Brokerage',
      phone: '016-554-332',
    },
    {
      email: 'sophea.meas@stlogistics.com',
      firstName: 'Sophea',
      lastName: 'Meas',
      role: UserRole.OPERATION,
      department: 'Logistics & Trucking',
      phone: '093-221-119',
    },
    {
      email: 'client.viewer@stlogistics.com',
      firstName: 'Client',
      lastName: 'Demo Viewer',
      role: UserRole.OWNER,
      department: 'Audit & Review',
      phone: '085-998-877',
    },
  ];

  const usersMap: Record<string, string> = {};
  for (const u of USERS) {
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        department: u.department,
        phone: u.phone,
      },
      create: {
        ...u,
        password: passwordHash,
      },
    });
    usersMap[u.email] = created.id;
  }
  console.log(`✅ Seeded ${USERS.length} system users across all roles (Password: ${defaultPassword})`);

  const adminUserId = usersMap[adminEmail];
  const accountantUserId = usersMap['sokha.chan@stlogistics.com'];
  const staffUserId = usersMap['dara.seng@stlogistics.com'];

  // 3. Company settings — single row keyed by a stable VAT id.
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
  console.log('✅ Seeded company settings');

  // 4. Tax rates — 10% (default) and 20%. Idempotent by unique `rate`.
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
  console.log(`✅ Seeded ${TAX_RATES.length} tax rates`);

  // 5. Suppliers — comprehensive partners across port authorities, trucking, fuel, insurance, and banking.
  const SUPPLIERS = [
    {
      code: 'SUP-001',
      nameEn: 'Phnom Penh Autonomous Port (PPAP)',
      nameKh: 'កំផង់ផែស្វយ័តភ្នំពេញ',
      nameCn: '金边自治港',
      taxId: 'K001-PPAP-1102',
      address: '#106, Preah Sisowath Quay, Sangkat Srah Chak',
      province: 'Phnom Penh',
      phone: '023-427-882',
      email: 'info@ppap.com.kh',
      contactPerson: 'Mr. Vanna Sok',
      paymentTerms: '15 Days / Bank Transfer',
      bankAccount: '001-223344-55',
      bankName: 'Vattanac Bank',
      notes: 'Main port authority for Phnom Penh river port clearance operations and container handling.',
    },
    {
      code: 'SUP-002',
      nameEn: 'Sihanoukville Autonomous Port (PAS)',
      nameKh: 'កំផង់ផែស្វយ័តក្រុងព្រះសីហនុ',
      nameCn: '西哈努克港',
      taxId: 'K002-PAS-8819',
      address: 'Vithei Kammeakorn, Sangkat 3',
      province: 'Preah Sihanouk',
      phone: '034-933-416',
      email: 'operations@pas.gov.kh',
      contactPerson: 'Mr. Chea Rithy',
      paymentTerms: 'Immediate / Prepaid Deposit',
      bankAccount: '002-998877-11',
      bankName: 'Acleda Bank Plc',
      notes: 'Deep-sea container terminal handling, yard storage, and wharfage charges.',
    },
    {
      code: 'SUP-003',
      nameEn: 'Mekong Express Trucking & Transport Co., Ltd',
      nameKh: 'មេគង្គ អេហ្សប្រេស ដឹកជញ្ជូន',
      nameCn: '湄公河物流运输',
      taxId: 'K009-MEK-4421',
      address: '#202, National Road 4, Khan Posenchey',
      province: 'Phnom Penh',
      phone: '012-889-112',
      email: 'dispatch@mekongtrucking.com',
      contactPerson: 'Mr. Samnang Keo',
      paymentTerms: '30 Days Net',
      bankAccount: '112-334455-88',
      bankName: 'ABA Bank',
      notes: 'Container haulage from SHV/PPAP ports to customer factories and special economic zones.',
    },
    {
      code: 'SUP-004',
      nameEn: 'Cambodia Customs Inspection & Testing Center',
      nameKh: 'មជ្ឈមណ្ឌលត្រួតពិនិត្យ និងកុងត្រូលគយ',
      nameCn: '海关检验中心',
      taxId: 'K001-CUS-0019',
      address: 'GDCE Compound, Preah Norodom Blvd',
      province: 'Phnom Penh',
      phone: '023-214-065',
      email: 'testing@customs.gov.kh',
      contactPerson: 'Officer Ly Peng',
      paymentTerms: 'Cash / Official Receipt',
      bankAccount: '001-000111-22',
      bankName: 'National Bank of Cambodia',
      notes: 'Official customs scanner, mobile container inspection, and quarantine certificate fees.',
    },
    {
      code: 'SUP-005',
      nameEn: 'Sokimex Petroleum Co., Ltd',
      nameKh: 'សូគីម៉ិច ភីត្រូឡូម',
      nameCn: '苏基密石油公司',
      taxId: 'K005-SOK-3310',
      address: '#22, Russian Federation Blvd, Sangkat Kakab',
      province: 'Phnom Penh',
      phone: '023-880-992',
      email: 'fleet@sokimex.com',
      contactPerson: 'Ms. Bopha Nguon',
      paymentTerms: 'Monthly Fleet Card Account',
      bankAccount: '005-776655-44',
      bankName: 'Canadia Bank',
      notes: 'Diesel and gasoline fuel cards for operation fleet and delivery vehicles.',
    },
    {
      code: 'SUP-006',
      nameEn: 'Forte Insurance (Cambodia) Plc',
      nameKh: 'ហ្វ័រតេ ធានារ៉ាប់រង',
      nameCn: '富德保险发展（柬埔寨）',
      taxId: 'K008-FOR-9921',
      address: '323-325, Preah Sihanouk Blvd',
      province: 'Phnom Penh',
      phone: '023-885-066',
      email: 'marine@forteinsurance.com',
      contactPerson: 'Ms. SreyLeak Choun',
      paymentTerms: '30 Days Net',
      bankAccount: '008-112233-99',
      bankName: 'ABA Bank',
      notes: 'Marine transit insurance, inland cargo protection, and third-party liability policies.',
    },
    {
      code: 'SUP-007',
      nameEn: 'Ezecom Cambodia',
      nameKh: 'អ៊ីហ្ស៊ីខម',
      nameCn: 'Ezecom 互联网服务',
      taxId: 'K003-EZE-5511',
      address: '#7D, Russian Federation Blvd, Chamber of Commerce Bldg',
      province: 'Phnom Penh',
      phone: '023-888-181',
      email: 'billing@ezecom.com.kh',
      contactPerson: 'Mr. Davit Ouk',
      paymentTerms: '14 Days Net',
      bankAccount: '003-445566-77',
      bankName: 'ABA Bank',
      notes: 'Dedicated enterprise fiber optic connection for HQ and customs ASYCUDA portal access.',
    },
    {
      code: 'SUP-008',
      nameEn: 'Vattanac Bank (Corporate Operations)',
      nameKh: 'ធនាគារ វឌ្ឍនៈ',
      nameCn: '瓦塔纳克银行',
      taxId: 'K001-VAT-0001',
      address: 'Vattanac Capital Tower, Preah Monivong Blvd',
      province: 'Phnom Penh',
      phone: '023-963-999',
      email: 'corporate@vattanacbank.com',
      contactPerson: 'Ms. Pich Channary',
      paymentTerms: 'Immediate Auto-Debit',
      bankAccount: '001-100200-300',
      bankName: 'Vattanac Bank',
      notes: 'Primary corporate checking account, LC processing, and bank handling charges.',
    },
  ];

  const suppliersMap: Record<string, string> = {};
  for (const s of SUPPLIERS) {
    const created = await prisma.supplier.upsert({
      where: { code: s.code },
      update: {
        nameEn: s.nameEn,
        nameKh: s.nameKh,
        nameCn: s.nameCn,
        taxId: s.taxId,
        address: s.address,
        phone: s.phone,
        email: s.email,
        contactPerson: s.contactPerson,
        paymentTerms: s.paymentTerms,
        bankAccount: s.bankAccount,
        bankName: s.bankName,
        notes: s.notes,
      },
      create: s,
    });
    suppliersMap[s.code] = created.id;
  }
  console.log(`✅ Seeded ${SUPPLIERS.length} suppliers`);

  // 6. Customers — key Cambodian importers & exporters across garments, electronics, agriculture, and construction.
  const CUSTOMERS = [
    {
      code: '027-01-26',
      nameEn: 'Grand Lion Garment Factory Co., Ltd',
      nameKh: 'រោងចក្រកាត់ដេរ ហ្រ្គេន ឡាយអិន',
      nameCn: '大狮制衣（柬埔寨）有限公司',
      taxId: 'K009-GLG-1122',
      address: 'Lot 45, Vattanac Industrial Park 2, National Road 3',
      district: 'Khan Dangkor',
      province: 'Phnom Penh',
      phone: '023-991-223',
      email: 'logistics@grandlion.com',
      contactPerson: 'Mr. Zhang Wei (General Manager)',
      paymentTerms: '30 Days Net',
      bankAccount: '001-889900-11',
      bankName: 'Vattanac Bank',
      notes: 'Major garment exporter to EU and USA under QIP tax-exempt status.',
    },
    {
      code: '027-02-26',
      nameEn: 'Angkor Electronics Distribution Co., Ltd',
      nameKh: 'អង្គរ អេឡិកត្រូនិក ឌីស្រ្ទីប៊ីយូសិន',
      nameCn: '吴哥电子销售服务',
      taxId: 'K005-AED-3344',
      address: '#188, Kampuchea Krom Blvd, Sangkat Mittapheap',
      district: 'Khan 7 Makara',
      province: 'Phnom Penh',
      phone: '012-776-554',
      email: 'import@angkorelectronics.com',
      contactPerson: 'Mr. Sophal Kheng',
      paymentTerms: '15 Days Net',
      bankAccount: '115-443322-00',
      bankName: 'ABA Bank',
      notes: 'Consumer electronics, home appliances, and solar inverter importer.',
    },
    {
      code: '027-03-26',
      nameEn: 'Mekong Agriculture & Rice Export Corp.',
      nameKh: 'ក្រុមហ៊ុននាំចេញអង្ករ មេគង្គ',
      nameCn: '湄公河农业与大米出口集团',
      taxId: 'K008-MAE-5566',
      address: 'National Road 5, Phum Prek Pnov',
      district: 'Khan Prek Pnov',
      province: 'Phnom Penh',
      phone: '017-332-110',
      email: 'shipping@mekongrice.com',
      contactPerson: 'Ms. Srey Leakhena',
      paymentTerms: '30 Days Net',
      bankAccount: '002-334455-66',
      bankName: 'Canadia Bank',
      notes: 'High-grade fragrant rice (Phka Rumduol) and agricultural commodities exporter.',
    },
    {
      code: '027-04-26',
      nameEn: 'Phnom Penh Heavy Machinery & Construction Group',
      nameKh: 'ភ្នំពេញ គ្រឿងចក្រ និងសំណង់',
      nameCn: '金边重工与工程建设集团',
      taxId: 'K003-PPH-7788',
      address: '#55, Hun Sen Blvd (60m Road), Sangkat Chak Angre',
      district: 'Khan Meanchey',
      province: 'Phnom Penh',
      phone: '092-445-667',
      email: 'machinery@ppmc-group.com',
      contactPerson: 'Mr. Jason Li',
      paymentTerms: '45 Days Net',
      bankAccount: '001-556677-88',
      bankName: 'BIDC Bank',
      notes: 'Excavators, cranes, and heavy construction equipment imports for infrastructure projects.',
    },
    {
      code: '027-05-26',
      nameEn: 'Royal Crown Beverage & Brewery Co., Ltd',
      nameKh: 'រ៉ូយ៉ាល់ ក្រោន បេវើរេជ និងប៊ីយែរ',
      nameCn: '皇家皇冠饮料与酿酒公司',
      taxId: 'K002-RCB-9900',
      address: 'Sihanoukville Special Economic Zone (SSEZ), Plot 12B',
      district: 'Prey Nob',
      province: 'Preah Sihanouk',
      phone: '034-889-001',
      email: 'supplychain@royalcrown.com.kh',
      contactPerson: 'Mr. David Smith',
      paymentTerms: '30 Days Net',
      bankAccount: '009-887766-55',
      bankName: 'Acleda Bank Plc',
      notes: 'Importing aluminum cans, packaging film, and brewery raw ingredients.',
    },
    {
      code: '027-06-26',
      nameEn: 'Khmer Green Solar & Clean Energy Solutions',
      nameKh: 'ខ្មែរ ហ្គ្រីន សូឡា និងថាមពលស្អាត',
      nameCn: '高棉绿色光伏与清洁能源技术',
      taxId: 'K007-KGS-2211',
      address: '#99, Mao Tse Toung Blvd, Sangkat Boeung Keng Kang 1',
      district: 'Khan Chamkarmon',
      province: 'Phnom Penh',
      phone: '016-990-881',
      email: 'operations@khmergreensolar.com',
      contactPerson: 'Ms. Channa Heng',
      paymentTerms: '15 Days Net',
      bankAccount: '112-990011-22',
      bankName: 'ABA Bank',
      notes: 'Commercial utility-scale solar panels, batteries, and high-voltage transformer imports.',
    },
  ];

  const customersMap: Record<string, string> = {};
  for (const c of CUSTOMERS) {
    const created = await prisma.customer.upsert({
      where: { code: c.code },
      update: {
        nameEn: c.nameEn,
        nameKh: c.nameKh,
        nameCn: c.nameCn,
        taxId: c.taxId,
        address: c.address,
        phone: c.phone,
        email: c.email,
        contactPerson: c.contactPerson,
        paymentTerms: c.paymentTerms,
        bankAccount: c.bankAccount,
        bankName: c.bankName,
        notes: c.notes,
      },
      create: c,
    });
    customersMap[c.code] = created.id;
  }
  console.log(`✅ Seeded ${CUSTOMERS.length} customers`);

  // Transactional demo data (bills, expenses, income, invoices, payments). Skipped
  // when SEED_TRANSACTIONS=false so a fresh DB can be walked through the flow from scratch.
  if (process.env.SEED_TRANSACTIONS !== 'false') {
  // 7. Operations — Customs Clearance Jobs register.
  const now = new Date();
  const CLEARANCE_JOBS = [
    {
      jobNumber: 'ST-2026-001',
      date: new Date(now.getTime() - 14 * 24 * 3600 * 1000),
      shipmentStatus: 'COMPLETED - RELEASED TO FACTORY',
      customerCode: '027-01-26',
      customerName: 'Grand Lion Garment Factory Co., Ltd',
      sizeVolume: '40HQ x 5 Containers',
      invoiceNumber: 'INV-GLG-202601',
      blBookingNumber: '026F5222213',
      commodity: 'GARMENT RAW FABRICS & COTTON THREADS',
      portClearance: 'SHV',
      transaction: 'IMP',
      notice: 'CLEARANCE COMPLETED UNDER QIP EXEMPTION. TRUCK DELIVERED ON TIME.',
      contacts: 'Mr. Wei / Officer Peng',
    },
    {
      jobNumber: 'ST-2026-002',
      date: new Date(now.getTime() - 12 * 24 * 3600 * 1000),
      shipmentStatus: 'COMPLETED - EXPORT LOADED ON VESSEL',
      customerCode: '027-03-26',
      customerName: 'Mekong Agriculture & Rice Export Corp.',
      sizeVolume: '20GP x 10 Containers (250 MT)',
      invoiceNumber: 'INV-MAE-8821',
      blBookingNumber: 'COSU66219842',
      commodity: 'PHKA RUMDUOL FRAGRANT RICE - GRADE A',
      portClearance: 'PPAP',
      transaction: 'EXP',
      notice: 'PHYTOSANITARY & CO CERTIFICATES VERIFIED BY CUSTOMS.',
      contacts: 'Ms. Srey Leakhena',
    },
    {
      jobNumber: 'ST-2026-003',
      date: new Date(now.getTime() - 8 * 24 * 3600 * 1000),
      shipmentStatus: 'IN PROGRESS - CUSTOMS SCANNER INSPECTION',
      customerCode: '027-02-26',
      customerName: 'Angkor Electronics Distribution Co., Ltd',
      sizeVolume: '40HQ x 2 Containers',
      invoiceNumber: 'INV-AED-0091',
      blBookingNumber: 'MEDU88210098',
      commodity: 'SOLAR INVERTERS & HOME APPLIANCES',
      portClearance: 'SHV',
      transaction: 'IMP',
      notice: 'WAITING FOR ASYCUDA VALUATION ASSESSMENT APPROVAL.',
      contacts: 'Mr. Sophal Kheng / Mr. Dara',
    },
    {
      jobNumber: 'ST-2026-004',
      date: new Date(now.getTime() - 5 * 24 * 3600 * 1000),
      shipmentStatus: 'IN PROGRESS - DUTY PAYMENT PENDING',
      customerCode: '027-04-26',
      customerName: 'Phnom Penh Heavy Machinery & Construction Group',
      sizeVolume: 'OOG Flat Rack x 3',
      invoiceNumber: 'INV-PPH-7712',
      blBookingNumber: 'OOLU11223344',
      commodity: 'HYDRAULIC EXCAVATORS 20 TON & CRANE PARTS',
      portClearance: 'SHV',
      transaction: 'IMP',
      notice: 'PASSED SHIPMENT TO RLS FOR SPECIAL CARGO ESCORT.',
      contacts: 'Mr. Jason Li',
    },
    {
      jobNumber: 'ST-2026-005',
      date: new Date(now.getTime() - 3 * 24 * 3600 * 1000),
      shipmentStatus: 'ARRIVED - DOCKING AT BERTH 4',
      customerCode: '027-05-26',
      customerName: 'Royal Crown Beverage & Brewery Co., Ltd',
      sizeVolume: '40HQ x 8 Containers',
      invoiceNumber: 'INV-RCB-5501',
      blBookingNumber: 'SUDU99887766',
      commodity: 'ALUMINUM BEVERAGE CANS & PACKAGING FOIL',
      portClearance: 'SHV',
      transaction: 'IMP',
      notice: 'PRIORITY CLEARANCE FOR SSEZ DIRECT DELIVERY.',
      contacts: 'Mr. David Smith',
    },
    {
      jobNumber: 'ST-2026-006',
      date: new Date(now.getTime() - 1 * 24 * 3600 * 1000),
      shipmentStatus: 'BOOKED - ARRIVING AT PORT NEXT MONDAY',
      customerCode: '027-06-26',
      customerName: 'Khmer Green Solar & Clean Energy Solutions',
      sizeVolume: '40HQ x 4 Containers',
      invoiceNumber: 'INV-KGS-3319',
      blBookingNumber: 'MSCU55443322',
      commodity: 'SOLAR PANELS 550W MONOCRYSTALLINE & BATTERY PACKS',
      portClearance: 'SHV',
      transaction: 'IMP',
      notice: 'DOCUMENTS RECEIVED AND ASYCUDA PRE-DECLARATION SUBMITTED.',
      contacts: 'Ms. Channa Heng',
    },
  ];

  for (const job of CLEARANCE_JOBS) {
    const customerId = customersMap[job.customerCode];
    await prisma.clearanceJob.upsert({
      where: { jobNumber: job.jobNumber },
      update: {
        shipmentStatus: job.shipmentStatus,
        sizeVolume: job.sizeVolume,
        commodity: job.commodity,
        portClearance: job.portClearance,
        transaction: job.transaction,
        notice: job.notice,
        contacts: job.contacts,
      },
      create: {
        jobNumber: job.jobNumber,
        date: job.date,
        shipmentStatus: job.shipmentStatus,
        customerId,
        customerName: job.customerName,
        sizeVolume: job.sizeVolume,
        invoiceNumber: job.invoiceNumber,
        blBookingNumber: job.blBookingNumber,
        commodity: job.commodity,
        portClearance: job.portClearance,
        transaction: job.transaction,
        notice: job.notice,
        contacts: job.contacts,
        createdBy: staffUserId ?? adminUserId,
      },
    });
  }
  console.log(`✅ Seeded ${CLEARANCE_JOBS.length} customs clearance jobs`);

  // 8. Expense Records — operational expenses linked to suppliers and chart of accounts.
  const EXPENSE_RECORDS = [
    {
      recordNumber: 'EXP-2026-001',
      recordDate: new Date(now.getTime() - 13 * 24 * 3600 * 1000),
      description: 'PPAP River Port Wharfage & Crane Lifting Charges (ST-2026-002)',
      expenseType: ExpenseType.TECHNICAL_OPERATIONS,
      supplierCode: 'SUP-001',
      amount: 450.00,
      accountCode: '5001',
      status: TransactionStatus.POSTED,
      approvalStatus: ApprovalStatus.APPROVED,
      invoiceNumber: 'PPAP-INV-8812',
    },
    {
      recordNumber: 'EXP-2026-002',
      recordDate: new Date(now.getTime() - 11 * 24 * 3600 * 1000),
      description: 'Sihanoukville Deep Sea Port Container Handling Fee (ST-2026-001)',
      expenseType: ExpenseType.TECHNICAL_OPERATIONS,
      supplierCode: 'SUP-002',
      amount: 1250.00,
      accountCode: '5001',
      status: TransactionStatus.POSTED,
      approvalStatus: ApprovalStatus.APPROVED,
      invoiceNumber: 'PAS-INV-00912',
    },
    {
      recordNumber: 'EXP-2026-003',
      recordDate: new Date(now.getTime() - 10 * 24 * 3600 * 1000),
      description: 'Container Haulage & Trucking Service 5x40HQ to Grand Lion Factory',
      expenseType: ExpenseType.TECHNICAL_OPERATIONS,
      supplierCode: 'SUP-003',
      amount: 1800.00,
      accountCode: '5001',
      status: TransactionStatus.POSTED,
      approvalStatus: ApprovalStatus.APPROVED,
      invoiceNumber: 'MEK-TRK-202601',
    },
    {
      recordNumber: 'EXP-2026-004',
      recordDate: new Date(now.getTime() - 7 * 24 * 3600 * 1000),
      description: 'Mobile Scanner & Customs Official Inspection Fee (ST-2026-003)',
      expenseType: ExpenseType.TECHNICAL_OPERATIONS,
      supplierCode: 'SUP-004',
      amount: 320.00,
      accountCode: '5001',
      status: TransactionStatus.POSTED,
      approvalStatus: ApprovalStatus.APPROVED,
      invoiceNumber: 'GDCE-REC-4411',
    },
    {
      recordNumber: 'EXP-2026-005',
      recordDate: new Date(now.getTime() - 5 * 24 * 3600 * 1000),
      description: 'Monthly Fleet Diesel Fuel Card Replenishment (Sokimex)',
      expenseType: ExpenseType.TECHNICAL_OPERATIONS,
      supplierCode: 'SUP-005',
      amount: 980.00,
      accountCode: '5001',
      status: TransactionStatus.POSTED,
      approvalStatus: ApprovalStatus.APPROVED,
      invoiceNumber: 'SOK-FUEL-9901',
    },
    {
      recordNumber: 'EXP-2026-006',
      recordDate: new Date(now.getTime() - 4 * 24 * 3600 * 1000),
      description: 'Marine Inland Transit Cargo Insurance Premium (ST-2026-004)',
      expenseType: ExpenseType.OTHER,
      supplierCode: 'SUP-006',
      amount: 640.00,
      accountCode: '5001',
      status: TransactionStatus.POSTED,
      approvalStatus: ApprovalStatus.APPROVED,
      invoiceNumber: 'FORTE-POL-8821',
    },
    {
      recordNumber: 'EXP-2026-007',
      recordDate: new Date(now.getTime() - 2 * 24 * 3600 * 1000),
      description: 'Dedicated Enterprise Fiber Optic Internet & ASYCUDA Line Monthly Fee',
      expenseType: ExpenseType.INTERNET,
      supplierCode: 'SUP-007',
      amount: 180.00,
      accountCode: '5006',
      status: TransactionStatus.POSTED,
      approvalStatus: ApprovalStatus.APPROVED,
      invoiceNumber: 'EZE-INV-1102',
    },
    {
      recordNumber: 'EXP-2026-008',
      recordDate: new Date(now.getTime() - 1 * 24 * 3600 * 1000),
      description: 'Container Port Security & Operations Guarantee Deposit (Refined)',
      expenseType: ExpenseType.DEPOSITS_PAID,
      supplierCode: 'SUP-002',
      amount: 1500.00,
      accountCode: '5002',
      status: TransactionStatus.PENDING,
      approvalStatus: ApprovalStatus.PENDING,
      invoiceNumber: 'PAS-DEP-202601',
    },
  ];

  for (const exp of EXPENSE_RECORDS) {
    const supplierId = suppliersMap[exp.supplierCode];
    const accountId = accountsMap[exp.accountCode];
    await prisma.expenseRecord.upsert({
      where: { recordNumber: exp.recordNumber },
      update: {
        description: exp.description,
        amount: exp.amount,
        status: exp.status,
        approvalStatus: exp.approvalStatus,
      },
      create: {
        recordNumber: exp.recordNumber,
        recordDate: exp.recordDate,
        description: exp.description,
        expenseType: exp.expenseType,
        supplierId,
        supplierName: exp.supplierCode,
        amount: exp.amount,
        currency: 'USD',
        accountId,
        status: exp.status,
        approvalStatus: exp.approvalStatus,
        approvedBy: exp.approvalStatus === ApprovalStatus.APPROVED ? (accountantUserId ?? adminUserId) : null,
        approvalDate: exp.approvalStatus === ApprovalStatus.APPROVED ? exp.recordDate : null,
        invoiceNumber: exp.invoiceNumber,
        createdBy: accountantUserId ?? adminUserId,
      },
    });
  }
  console.log(`✅ Seeded ${EXPENSE_RECORDS.length} operational expense records`);

  // 9. Income Records — customs clearance & trucking revenues from customers.
  const INCOME_RECORDS = [
    {
      recordNumber: 'INC-2026-001',
      recordDate: new Date(now.getTime() - 13 * 24 * 3600 * 1000),
      description: 'Customs Clearance Service Fee & ASYCUDA Processing (ST-2026-001)',
      serviceType: ServiceType.CUSTOMS_CLEARANCE,
      customerCode: '027-01-26',
      amount: 850.00,
      accountCode: '4001',
      status: TransactionStatus.POSTED,
      invoiceNumber: 'ST25-000101',
      billNumber: '026F5222213',
    },
    {
      recordNumber: 'INC-2026-002',
      recordDate: new Date(now.getTime() - 12 * 24 * 3600 * 1000),
      description: 'Inland Container Trucking Delivery SHV to Factory (5x40HQ)',
      serviceType: ServiceType.TRUCKING_SERVICE,
      customerCode: '027-01-26',
      amount: 2250.00,
      accountCode: '4004',
      status: TransactionStatus.POSTED,
      invoiceNumber: 'ST25-000101',
      billNumber: '026F5222213',
    },
    {
      recordNumber: 'INC-2026-003',
      recordDate: new Date(now.getTime() - 11 * 24 * 3600 * 1000),
      description: 'Export Phytosanitary & Customs Clearance Service (ST-2026-002)',
      serviceType: ServiceType.CUSTOMS_CLEARANCE,
      customerCode: '027-03-26',
      amount: 1450.00,
      accountCode: '4001',
      status: TransactionStatus.POSTED,
      invoiceNumber: 'ST25-000103',
      billNumber: 'COSU66219842',
    },
    {
      recordNumber: 'INC-2026-004',
      recordDate: new Date(now.getTime() - 8 * 24 * 3600 * 1000),
      description: 'Import License & Quarantine Processing Fee (ST-2026-003)',
      serviceType: ServiceType.LICENSE_FEE,
      customerCode: '027-02-26',
      amount: 680.00,
      accountCode: '4003',
      status: TransactionStatus.POSTED,
      invoiceNumber: 'ST25-000102',
      billNumber: 'MEDU88210098',
    },
    {
      recordNumber: 'INC-2026-005',
      recordDate: new Date(now.getTime() - 6 * 24 * 3600 * 1000),
      description: 'Yard Storage Fee Reimbursement & Handling Charges',
      serviceType: ServiceType.STORAGE_FEE,
      customerCode: '027-04-26',
      amount: 1200.00,
      accountCode: '4002',
      status: TransactionStatus.POSTED,
      invoiceNumber: 'ST25-000104',
      billNumber: 'OOLU11223344',
    },
    {
      recordNumber: 'INC-2026-006',
      recordDate: new Date(now.getTime() - 3 * 24 * 3600 * 1000),
      description: 'Customs Brokerage Service for Direct SSEZ Delivery (ST-2026-005)',
      serviceType: ServiceType.BROKERAGE_SERVICE,
      customerCode: '027-05-26',
      amount: 1800.00,
      accountCode: '4005',
      status: TransactionStatus.POSTED,
      invoiceNumber: 'ST25-000105',
      billNumber: 'SUDU99887766',
    },
  ];

  for (const inc of INCOME_RECORDS) {
    const customerId = customersMap[inc.customerCode];
    const accountId = accountsMap[inc.accountCode];
    await prisma.incomeRecord.upsert({
      where: { recordNumber: inc.recordNumber },
      update: {
        description: inc.description,
        amount: inc.amount,
        status: inc.status,
      },
      create: {
        recordNumber: inc.recordNumber,
        recordDate: inc.recordDate,
        description: inc.description,
        serviceType: inc.serviceType,
        customerId,
        amount: inc.amount,
        currency: 'USD',
        invoiceNumber: inc.invoiceNumber,
        billNumber: inc.billNumber,
        receivedFrom: staffUserId ?? adminUserId,
        accountId,
        status: inc.status,
        createdBy: accountantUserId ?? adminUserId,
      },
    });
  }
  console.log(`✅ Seeded ${INCOME_RECORDS.length} revenue/income records`);

  // 10. Invoices & Line Items — comprehensive billing history with payments.
  const INVOICES = [
    {
      invoiceNumber: 'ST25-000101',
      invoiceDate: new Date(now.getTime() - 14 * 24 * 3600 * 1000),
      dueDate: new Date(now.getTime() - 4 * 24 * 3600 * 1000),
      customerCode: '027-01-26',
      subtotal: 3100.00,
      taxRate: 10,
      taxAmount: 310.00,
      totalAmount: 3410.00,
      paidAmount: 3410.00,
      balanceDue: 0.00,
      status: InvoiceStatus.PAID,
      description: 'Customs Clearance & Haulage Services for 5x40HQ Garment Materials',
      lineItems: [
        { itemNumber: 1, description: 'Customs ASYCUDA Clearance Fee (5 Containers)', quantity: 5, unitPrice: 170.00, amount: 850.00 },
        { itemNumber: 2, description: 'Inland Haulage SHV Port to Factory', quantity: 5, unitPrice: 450.00, amount: 2250.00 },
      ],
      payment: {
        paymentNumber: 'PAY-2026-0101',
        amount: 3410.00,
        method: PaymentMethod.BANK_TRANSFER,
        bankName: 'Vattanac Bank',
        referenceNumber: 'FT2601019982',
      },
    },
    {
      invoiceNumber: 'ST25-000102',
      invoiceDate: new Date(now.getTime() - 8 * 24 * 3600 * 1000),
      dueDate: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
      customerCode: '027-02-26',
      subtotal: 1980.00,
      taxRate: 10,
      taxAmount: 198.00,
      totalAmount: 2178.00,
      paidAmount: 0.00,
      balanceDue: 2178.00,
      status: InvoiceStatus.ISSUED,
      description: 'Import License & Port Processing for Solar Inverter Containers',
      lineItems: [
        { itemNumber: 1, description: 'Import License & Quarantine Clearance Fee', quantity: 1, unitPrice: 680.00, amount: 680.00 },
        { itemNumber: 2, description: 'Port Container Handling & Scanner Escort', quantity: 2, unitPrice: 650.00, amount: 1300.00 },
      ],
    },
    {
      invoiceNumber: 'ST25-000103',
      invoiceDate: new Date(now.getTime() - 11 * 24 * 3600 * 1000),
      dueDate: new Date(now.getTime() - 1 * 24 * 3600 * 1000),
      customerCode: '027-03-26',
      subtotal: 3800.00,
      taxRate: 10,
      taxAmount: 380.00,
      totalAmount: 4180.00,
      paidAmount: 2000.00,
      balanceDue: 2180.00,
      status: InvoiceStatus.PARTIALLY_PAID,
      description: 'Export Phytosanitary Inspection & Freight Forwarding Services',
      lineItems: [
        { itemNumber: 1, description: 'Export Customs Declaration & CO Processing', quantity: 10, unitPrice: 145.00, amount: 1450.00 },
        { itemNumber: 2, description: 'River Port PPAP Terminal Handling Charge', quantity: 10, unitPrice: 235.00, amount: 2350.00 },
      ],
      payment: {
        paymentNumber: 'PAY-2026-0103',
        amount: 2000.00,
        method: PaymentMethod.CHECK,
        bankName: 'Canadia Bank',
        referenceNumber: 'CHK-881902',
      },
    },
    {
      invoiceNumber: 'ST25-000104',
      invoiceDate: new Date(now.getTime() - 20 * 24 * 3600 * 1000),
      dueDate: new Date(now.getTime() - 5 * 24 * 3600 * 1000),
      customerCode: '027-04-26',
      subtotal: 4700.00,
      taxRate: 10,
      taxAmount: 470.00,
      totalAmount: 5170.00,
      paidAmount: 0.00,
      balanceDue: 5170.00,
      status: InvoiceStatus.OVERDUE,
      description: 'Heavy Machinery Special Escort & Port Storage Fees',
      lineItems: [
        { itemNumber: 1, description: 'Special Cargo Customs Valuation & Escort', quantity: 3, unitPrice: 1166.67, amount: 3500.00 },
        { itemNumber: 2, description: 'Port Demurrage & Yard Storage Reimbursement', quantity: 1, unitPrice: 1200.00, amount: 1200.00 },
      ],
    },
    {
      invoiceNumber: 'ST25-000105',
      invoiceDate: new Date(now.getTime() - 4 * 24 * 3600 * 1000),
      dueDate: new Date(now.getTime() + 11 * 24 * 3600 * 1000),
      customerCode: '027-05-26',
      subtotal: 1800.00,
      taxRate: 10,
      taxAmount: 180.00,
      totalAmount: 1980.00,
      paidAmount: 1980.00,
      balanceDue: 0.00,
      status: InvoiceStatus.PAID,
      description: 'Priority Customs Brokerage for SSEZ Direct Delivery',
      lineItems: [
        { itemNumber: 1, description: 'Customs Clearance & SSEZ Direct Transit Fee', quantity: 8, unitPrice: 225.00, amount: 1800.00 },
      ],
      payment: {
        paymentNumber: 'PAY-2026-0105',
        amount: 1980.00,
        method: PaymentMethod.BANK_TRANSFER,
        bankName: 'Acleda Bank Plc',
        referenceNumber: 'TRX-9901882',
      },
    },
    {
      invoiceNumber: 'ST25-000106',
      invoiceDate: new Date(),
      dueDate: new Date(now.getTime() + 15 * 24 * 3600 * 1000),
      customerCode: '027-06-26',
      subtotal: 1100.00,
      taxRate: 10,
      taxAmount: 110.00,
      totalAmount: 1210.00,
      paidAmount: 0.00,
      balanceDue: 1210.00,
      status: InvoiceStatus.DRAFT,
      description: 'Pre-Declaration ASYCUDA Processing for Solar Panels',
      lineItems: [
        { itemNumber: 1, description: 'ASYCUDA Pre-Declaration & Document Review', quantity: 4, unitPrice: 275.00, amount: 1100.00 },
      ],
    },
  ];

  for (const inv of INVOICES) {
    const customerId = customersMap[inv.customerCode];

    // Check if invoice exists
    let invoice = await prisma.invoice.findUnique({
      where: { invoiceNumber: inv.invoiceNumber },
    });

    if (!invoice) {
      invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          dueDate: inv.dueDate,
          customerId,
          subtotal: inv.subtotal,
          taxRate: inv.taxRate,
          taxAmount: inv.taxAmount,
          totalAmount: inv.totalAmount,
          paidAmount: inv.paidAmount,
          balanceDue: inv.balanceDue,
          status: inv.status,
          description: inv.description,
          invoiceType: InvoiceType.TAX_INVOICE,
          underCompanyTitle: true,
          issuedBy: accountantUserId ?? adminUserId,
          lineItems: {
            create: inv.lineItems,
          },
        },
      });
    } else {
      invoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotal: inv.subtotal,
          taxAmount: inv.taxAmount,
          totalAmount: inv.totalAmount,
          paidAmount: inv.paidAmount,
          balanceDue: inv.balanceDue,
          status: inv.status,
          description: inv.description,
        },
      });
    }

    if (inv.payment) {
      await prisma.payment.upsert({
        where: { paymentNumber: inv.payment.paymentNumber },
        update: {
          amount: inv.payment.amount,
          method: inv.payment.method,
          bankName: inv.payment.bankName,
          referenceNumber: inv.payment.referenceNumber,
        },
        create: {
          paymentNumber: inv.payment.paymentNumber,
          paymentDate: inv.invoiceDate,
          invoiceId: invoice.id,
          amount: inv.payment.amount,
          currency: 'USD',
          method: inv.payment.method,
          bankName: inv.payment.bankName,
          referenceNumber: inv.payment.referenceNumber,
          status: PaymentStatus.COMPLETED,
          notes: `Payment for invoice ${inv.invoiceNumber}`,
        },
      });
    }
  }
  console.log(`✅ Seeded ${INVOICES.length} invoices with detailed line items and payments`);
  } else {
    console.log('⏭️  Skipped transactional data (SEED_TRANSACTIONS=false) — bills, expenses, income, invoices, payments');
  }
  console.log('\n🌟 Seeding complete!');
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });

