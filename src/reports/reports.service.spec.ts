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
