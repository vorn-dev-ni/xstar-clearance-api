import { UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntryLineType, EntryStatus, ReferenceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService, type PostJournalParams } from './journal.service';

/** Minimal in-memory transaction client capturing the journal write. */
function makeTx() {
  const created: { data: unknown }[] = [];
  const balanceUpdates: { id: string; delta: number }[] = [];
  return {
    tx: {
      journalEntry: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((args: { data: unknown }) => {
          created.push(args);
          return Promise.resolve({
            id: 'je_1',
            status: EntryStatus.POSTED,
            lines: [],
          });
        }),
      },
      account: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'bank', type: 'BANK' },
          { id: 'rev', type: 'REVENUE' },
        ]),
        update: jest.fn(
          (args: {
            where: { id: string };
            data: { balance: { increment: number } };
          }) => {
            balanceUpdates.push({
              id: args.where.id,
              delta: args.data.balance.increment,
            });
            return Promise.resolve({});
          },
        ),
      },
    },
    created,
    balanceUpdates,
  };
}

const baseParams = (lines: PostJournalParams['lines']): PostJournalParams => ({
  entryDate: new Date('2026-02-26T00:00:00Z'),
  description: 'test',
  referenceType: ReferenceType.INCOME,
  createdBy: 'user_1',
  lines,
});

describe('JournalService.postJournal', () => {
  let service: JournalService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [JournalService, { provide: PrismaService, useValue: {} }],
    }).compile();
    service = moduleRef.get(JournalService);
  });

  it('rejects an unbalanced entry', async () => {
    const { tx } = makeTx();
    await expect(
      service.postJournal(
        tx.tx as never,
        baseParams([
          { accountId: 'bank', entryType: EntryLineType.DEBIT, amount: 100 },
          { accountId: 'rev', entryType: EntryLineType.CREDIT, amount: 90 },
        ]),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('posts a balanced entry and moves account balances by natural sign', async () => {
    const h = makeTx();
    await service.postJournal(
      h.tx as never,
      baseParams([
        { accountId: 'bank', entryType: EntryLineType.DEBIT, amount: 289.06 },
        { accountId: 'rev', entryType: EntryLineType.CREDIT, amount: 289.06 },
      ]),
    );

    // BANK debit -> +289.06; REVENUE credit -> +289.06 (both increase).
    expect(h.balanceUpdates).toEqual([
      { id: 'bank', delta: 289.06 },
      { id: 'rev', delta: 289.06 },
    ]);
  });

  it('numbers entries as JE-YYYY-0001', async () => {
    const h = makeTx();
    await service.postJournal(
      h.tx as never,
      baseParams([
        { accountId: 'bank', entryType: EntryLineType.DEBIT, amount: 10 },
        { accountId: 'rev', entryType: EntryLineType.CREDIT, amount: 10 },
      ]),
    );
    const data = (h.created[0].data as { entryNumber: string }).entryNumber;
    expect(data).toBe('JE-2026-0001');
  });
});
