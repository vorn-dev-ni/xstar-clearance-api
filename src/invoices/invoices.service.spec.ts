import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { JournalService } from '../journal/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from './invoices.service';

/**
 * findAll builds a `where` clause from the query, then runs findMany/count/aggregate
 * inside a single `$transaction([...])`. The mock captures the args each Prisma call
 * receives so we can assert the filter branch without a database.
 */
function makePrisma() {
  const calls: { findMany?: unknown; count?: unknown; aggregate?: unknown } =
    {};
  const invoice = {
    findMany: jest.fn((args: unknown) => {
      calls.findMany = args;
      return Promise.resolve([]);
    }),
    count: jest.fn((args: unknown) => {
      calls.count = args;
      return Promise.resolve(0);
    }),
    aggregate: jest.fn((args: unknown) => {
      calls.aggregate = args;
      return Promise.resolve({
        _sum: { totalAmount: null, paidAmount: null, balanceDue: null },
      });
    }),
  };
  const prisma = {
    invoice,
    // findAll passes an array of PrismaPromises; resolve them all like the real client.
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma, invoice, calls };
}

describe('InvoicesService.findAll', () => {
  async function build() {
    const { prisma, invoice, calls } = makePrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: JournalService, useValue: {} },
        { provide: AuditService, useValue: {} },
      ],
    }).compile();
    return {
      service: moduleRef.get(InvoicesService),
      invoice,
      calls,
    };
  }

  it('applies status, customer, search and date-range filters', async () => {
    const { service, calls } = await build();

    await service.findAll({
      page: 1,
      limit: 20,
      status: 'ISSUED',
      invoiceType: 'DEBIT_NOTE',
      customerId: 'cust_1',
      search: 'ST26',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });

    const where = (calls.findMany as { where: Prisma.InvoiceWhereInput }).where;
    expect(where.status).toBe('ISSUED');
    expect(where.invoiceType).toBe('DEBIT_NOTE');
    expect(where.customerId).toBe('cust_1');
    expect(where.invoiceNumber).toEqual({
      contains: 'ST26',
      mode: 'insensitive',
    });
    expect(where.invoiceDate).toEqual({
      gte: new Date('2026-01-01'),
      lte: new Date('2026-12-31'),
    });
    // The same where feeds count + aggregate so totals stay consistent.
    expect((calls.count as { where: unknown }).where).toEqual(where);
    expect((calls.aggregate as { where: unknown }).where).toEqual(where);
  });

  it('omits optional filters when the query is empty', async () => {
    const { service, calls } = await build();

    await service.findAll({ page: 1, limit: 20 });

    const where = (calls.findMany as { where: Prisma.InvoiceWhereInput }).where;
    expect(where.invoiceNumber).toBeUndefined();
    expect(where.invoiceDate).toBeUndefined();
  });

  it('builds a one-sided date range from dateFrom only', async () => {
    const { service, calls } = await build();

    await service.findAll({
      page: 1,
      limit: 20,
      dateFrom: '2026-06-01',
    });

    const where = (calls.findMany as { where: Prisma.InvoiceWhereInput }).where;
    expect(where.invoiceDate).toEqual({
      gte: new Date('2026-06-01'),
      lte: undefined,
    });
  });
});

describe('InvoicesService.create — invoice types', () => {
  function build() {
    const created: { data: Record<string, unknown> }[] = [];
    const tx = {
      invoice: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          created.push(args);
          return Promise.resolve({
            id: 'inv_1',
            invoiceNumber: 'ST26-000001',
            invoiceDate: new Date(),
            createdAt: new Date(),
            status: 'DRAFT',
            ...args.data,
          });
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new InvoicesService(
      prisma as unknown as PrismaService,
      {} as JournalService,
      audit as unknown as AuditService,
    );
    return { service, created };
  }

  const baseDto = {
    customerId: 'cust_1',
    invoiceDate: '2026-05-22',
    lineItems: [
      {
        itemNumber: 1,
        description: 'Fee',
        quantity: 1,
        unitPrice: 100,
        taxable: true,
      },
    ],
  };

  it('DEBIT_NOTE zeroes VAT and is not under company title', async () => {
    const { service, created } = build();

    await service.create(
      { ...baseDto, invoiceType: 'DEBIT_NOTE' } as never,
      'user_1',
    );

    const data = created[0].data;
    expect(data.invoiceType).toBe('DEBIT_NOTE');
    expect(Number(data.taxRate)).toBe(0);
    expect(data.taxAmount).toBe(0);
    expect(data.underCompanyTitle).toBe(false);
    expect(data.totalAmount).toBe(100);
  });

  it('TAX_INVOICE applies the default 10% VAT', async () => {
    const { service, created } = build();

    await service.create(baseDto, 'user_1');

    const data = created[0].data;
    expect(data.taxAmount).toBe(10);
    expect(data.underCompanyTitle).toBe(true);
    expect(data.totalAmount).toBe(110);
  });
});
