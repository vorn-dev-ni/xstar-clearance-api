import type { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

/** Mock Prisma returning a fixed set of outstanding invoices for aging tests. */
function makePrisma(invoices: unknown[]) {
  const prisma = {
    invoice: { findMany: jest.fn().mockResolvedValue(invoices) },
  };
  return prisma as unknown as PrismaService;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe('ReportsService.aging', () => {
  it('buckets outstanding balances by days past due and totals them', async () => {
    const prisma = makePrisma([
      {
        invoiceNumber: 'A',
        dueDate: daysAgo(-5),
        invoiceDate: daysAgo(1),
        balanceDue: 100,
        customer: { nameEn: 'Cust A' },
      }, // not yet due -> current
      {
        invoiceNumber: 'B',
        dueDate: daysAgo(10),
        invoiceDate: daysAgo(15),
        balanceDue: 200,
        customer: { nameEn: 'Cust B' },
      }, // 1-30
      {
        invoiceNumber: 'C',
        dueDate: daysAgo(75),
        invoiceDate: daysAgo(80),
        balanceDue: 300,
        customer: { nameEn: 'Cust C' },
      }, // 61-90
      {
        invoiceNumber: 'D',
        dueDate: daysAgo(120),
        invoiceDate: daysAgo(130),
        balanceDue: 400,
        customer: { nameEn: 'Cust D' },
      }, // 90+
    ]);
    const service = new ReportsService(prisma);

    const result = await service.aging();

    expect(result.buckets.current).toBe(100);
    expect(result.buckets.d1_30).toBe(200);
    expect(result.buckets.d61_90).toBe(300);
    expect(result.buckets.d90_plus).toBe(400);
    expect(result.totalOutstanding).toBe(1000);
    expect(result.rows).toHaveLength(4);
  });
});

describe('ReportsService.monthlyTrend', () => {
  it('buckets posted journal lines into 12 months of revenue/expenses', async () => {
    const lines = [
      {
        amount: 500,
        entryType: 'CREDIT',
        entry: { entryDate: new Date(Date.UTC(2026, 0, 15)) },
        account: { type: 'REVENUE' },
      },
      {
        amount: 100,
        entryType: 'DEBIT',
        entry: { entryDate: new Date(Date.UTC(2026, 0, 20)) },
        account: { type: 'EXPENSE' },
      },
      {
        amount: 50,
        entryType: 'DEBIT', // revenue reversal
        entry: { entryDate: new Date(Date.UTC(2026, 5, 3)) },
        account: { type: 'REVENUE' },
      },
    ];
    const prisma = {
      journalEntryLine: { findMany: jest.fn().mockResolvedValue(lines) },
    } as unknown as PrismaService;
    const service = new ReportsService(prisma);

    const result = await service.monthlyTrend(2026);

    expect(result.year).toBe(2026);
    expect(result.months).toHaveLength(12);
    expect(result.months[0]).toEqual({
      month: 1,
      revenue: 500,
      expenses: 100,
      netProfit: 400,
    });
    expect(result.months[5]).toEqual({
      month: 6,
      revenue: -50,
      expenses: 0,
      netProfit: -50,
    });
    expect(result.months[11].revenue).toBe(0);
  });
});

function plLine(
  accountId: string,
  code: string,
  type: 'REVENUE' | 'EXPENSE',
  entryType: 'DEBIT' | 'CREDIT',
  amount: number,
) {
  return {
    amount,
    entryType,
    account: {
      id: accountId,
      code,
      nameEn: `Acct ${code}`,
      type,
      category: 'X',
    },
  };
}

describe('ReportsService.profitLoss — per-account lines', () => {
  it('returns per-account rows that sum to the section totals and net profit', async () => {
    const prisma = {
      journalEntryLine: {
        findMany: jest.fn().mockResolvedValue([
          plLine('rev1', '4001', 'REVENUE', 'CREDIT', 100),
          plLine('rev1', '4001', 'REVENUE', 'CREDIT', 50), // same account accumulates
          plLine('rev2', '4002', 'REVENUE', 'CREDIT', 30),
          plLine('exp1', '5001', 'EXPENSE', 'DEBIT', 40),
        ]),
      },
    } as unknown as PrismaService;
    const service = new ReportsService(prisma);

    const res = await service.profitLoss(6, 2026);

    expect(res.revenue.accounts).toHaveLength(2);
    expect(
      res.revenue.accounts.find((a) => a.accountId === 'rev1')?.amount,
    ).toBe(150);
    expect(res.revenue.totalRevenue).toBe(180);
    expect(res.expenses.accounts).toHaveLength(1);
    expect(res.expenses.totalExpenses).toBe(40);
    expect(res.netProfit).toBe(140);
    const revSum = res.revenue.accounts.reduce((s, a) => s + a.amount, 0);
    expect(revSum).toBe(res.revenue.totalRevenue);
  });
});

describe('ReportsService.balanceSheet — per-account lines', () => {
  it('lists each account with an accountId and keeps the sheet balanced', async () => {
    const prisma = {
      account: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            code: '1100',
            nameEn: 'Bank',
            category: 'BANK_ACCOUNT',
            type: 'BANK',
            balance: 1000,
          },
          {
            id: 'l1',
            code: '2100',
            nameEn: 'A/P',
            category: 'PAYABLES',
            type: 'LIABILITY',
            balance: 400,
          },
          {
            id: 'e1',
            code: '3001',
            nameEn: 'Capital',
            category: 'EQUITY',
            type: 'EQUITY',
            balance: 200,
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new ReportsService(prisma);

    const res = await service.balanceSheet();

    expect(res.assets.accounts[0]).toMatchObject({
      accountId: 'a1',
      code: '1100',
    });
    expect(res.assets.totalAssets).toBe(1000);
    expect(res.liabilities.accounts[0].accountId).toBe('l1');
    // retained earnings = assets - liabilities - equity = 1000 - 400 - 200 = 400
    expect(res.equity.retainedEarnings).toBe(400);
    // Assets = Liabilities + Equity
    expect(res.assets.totalAssets).toBe(res.totalLiabilitiesAndEquity);
  });
});
