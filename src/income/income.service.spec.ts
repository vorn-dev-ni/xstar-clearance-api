import { BadRequestException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JournalService } from '../journal/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { IncomeService } from './income.service';

describe('IncomeService.createFromInvoiceTx', () => {
  function build(existing: unknown = null) {
    const tx = {
      incomeRecord: {
        findUnique: jest.fn().mockResolvedValue(existing),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'inc_1', ...args.data }),
        ),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({ nameEn: 'Acme Co' }),
      },
    };
    const journal = {
      accountIdByCode: jest.fn().mockResolvedValue('rev_acc'),
      postJournal: jest.fn(),
    };
    const service = new IncomeService(
      {} as PrismaService,
      journal as unknown as JournalService,
      { log: jest.fn() } as unknown as AuditService,
    );
    return { service, tx, journal };
  }

  const invoice = {
    id: 'inv_1',
    invoiceNumber: 'ST26-000001',
    customerId: 'cust_1',
    totalAmount: 110 as unknown as never,
    currency: 'USD',
    clearanceJobId: null,
  };

  it('creates a reporting-only INVOICE-sourced record and does NOT post to the journal', async () => {
    const { service, tx, journal } = build();

    await service.createFromInvoiceTx(
      tx as never,
      invoice,
      new Date('2026-06-01'),
      'user_1',
    );

    expect(tx.incomeRecord.create).toHaveBeenCalledTimes(1);
    const data = tx.incomeRecord.create.mock.calls[0][0].data;
    expect(data.source).toBe('INVOICE');
    expect(data.invoiceId).toBe('inv_1');
    expect(data.amount).toBe(110);
    expect(data.status).toBe('POSTED');
    // The whole point: no second revenue posting to the ledger.
    expect(journal.postJournal).not.toHaveBeenCalled();
  });

  it('is idempotent — no duplicate row when one already links the invoice', async () => {
    const { service, tx } = build({ id: 'inc_existing' });

    const result = await service.createFromInvoiceTx(
      tx as never,
      invoice,
      new Date('2026-06-01'),
      'user_1',
    );

    expect(result).toEqual({ id: 'inc_existing' });
    expect(tx.incomeRecord.create).not.toHaveBeenCalled();
  });
});

describe('IncomeService.update — invoice-sourced guard', () => {
  it('rejects editing an INVOICE-sourced record', async () => {
    const prisma = {
      incomeRecord: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'inc_1', source: 'INVOICE' }),
      },
    };
    const service = new IncomeService(
      prisma as unknown as PrismaService,
      {} as JournalService,
      { log: jest.fn() } as unknown as AuditService,
    );

    await expect(
      service.update('inc_1', { amount: 5 }, 'user_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
