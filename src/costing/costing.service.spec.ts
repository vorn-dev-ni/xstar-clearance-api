import type { AuditService } from '../audit/audit.service';
import type { ExpenseService } from '../expense/expense.service';
import type { IncomeService } from '../income/income.service';
import type { PrismaService } from '../prisma/prisma.service';
import { CostingService } from './costing.service';

/** Minimal expense/income row shapes the service reads. */
function costRow(overrides: Record<string, unknown>) {
  return {
    id: 'e',
    recordNumber: 'EXP-1',
    recordDate: new Date('2026-05-30'),
    supplierName: 'Payee',
    supplier: null,
    invoiceNumber: null,
    description: 'Cost',
    amount: 0,
    taxAmount: null,
    deposit: null,
    actualCost: null,
    notes: null,
    status: 'PENDING',
    ...overrides,
  };
}

function build(expenses: unknown[], incomes: unknown[]) {
  const prisma = {
    clearanceJob: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'job_1',
        jobNumber: 'IMP-2026-0007',
        blBookingNumber: 'MAEU802120349',
        customerName: 'AVATR',
        customer: null,
      }),
    },
    expenseRecord: { findMany: jest.fn().mockResolvedValue(expenses) },
    incomeRecord: { findMany: jest.fn().mockResolvedValue(incomes) },
    $transaction: jest.fn((arr: Promise<unknown>[]) => Promise.all(arr)),
  };
  const service = new CostingService(
    prisma as unknown as PrismaService,
    {} as ExpenseService,
    {} as IncomeService,
    {} as AuditService,
  );
  return { service };
}

describe('CostingService.getStatement', () => {
  it('reproduces the AVATR07 B/L MAEU802120349 sheet (Σ actual cost = 1891.7)', async () => {
    const { service } = build(
      [
        costRow({ amount: 545, actualCost: 545 }),
        costRow({ amount: 404, actualCost: 404 }),
        costRow({ amount: 717.7, actualCost: 717.7 }),
        costRow({ amount: 225, actualCost: 225 }),
      ],
      [],
    );

    const result = await service.getStatement('job_1');

    expect(result.totals.totalCost).toBe(1891.7);
    expect(result.totals.totalIncome).toBe(0);
    // No income yet → profit is the negative of costing.
    expect(result.totals.profit).toBe(-1891.7);
    expect(result.job.blBookingNumber).toBe('MAEU802120349');
  });

  it('derives actual cost = amount + tax − deposit for rows without a stored value', async () => {
    const { service } = build(
      [costRow({ amount: 500, taxAmount: 50, deposit: 100, actualCost: null })],
      [{ amount: 1000 }],
    );

    const result = await service.getStatement('job_1');

    expect(result.costLines[0].actualCost).toBe(450); // 500 + 50 − 100
    expect(result.totals.totalCost).toBe(450);
    expect(result.totals.totalIncome).toBe(1000);
    expect(result.totals.profit).toBe(550);
  });
});
