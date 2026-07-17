import { Test } from '@nestjs/testing';
import { ContainerDepositStatus } from '@prisma/client';
import { JournalService } from '../journal/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { DepositsService } from './deposits.service';

/**
 * updateStatus runs inside a `$transaction(cb)` — the mock invokes the callback
 * with a `tx` exposing deposit.findUnique/update so we can assert whether the
 * refund reversing entry is posted, without a database.
 */
function build(current: ContainerDepositStatus) {
  const deposit = {
    id: 'dep_1',
    depositNumber: 'DEP-2026-0001',
    purpose: 'Container Deposit',
    amount: 1800,
    accountId: 'acc_deposit',
    status: current,
    releasedDate: null as Date | null,
  };
  const tx = {
    deposit: {
      findUnique: jest.fn(() => Promise.resolve(deposit)),
      update: jest.fn((args: { data: unknown }) =>
        Promise.resolve({ ...deposit, ...(args.data as object) }),
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const journal = {
    accountIdByCode: jest.fn(() => Promise.resolve('acc_bank')),
    postJournal: jest.fn(() => Promise.resolve()),
  };
  return { prisma, journal, tx };
}

async function makeService(current: ContainerDepositStatus) {
  const { prisma, journal, tx } = build(current);
  const moduleRef = await Test.createTestingModule({
    providers: [
      DepositsService,
      { provide: PrismaService, useValue: prisma },
      { provide: JournalService, useValue: journal },
    ],
  }).compile();
  return { service: moduleRef.get(DepositsService), journal, tx };
}

describe('DepositsService.updateStatus', () => {
  it('posts a reversing entry (DR bank / CR deposit) when refunded', async () => {
    const { service, journal, tx } = await makeService(
      ContainerDepositStatus.AWAITING_DEPOSIT_REFUND,
    );

    await service.updateStatus(
      'dep_1',
      ContainerDepositStatus.DEPOSIT_REFUNDED,
      'user_1',
    );

    expect(journal.postJournal).toHaveBeenCalledTimes(1);
    const [, entry] = journal.postJournal.mock.calls[0];
    expect(entry.lines).toEqual([
      { accountId: 'acc_bank', entryType: 'DEBIT', amount: 1800 },
      { accountId: 'acc_deposit', entryType: 'CREDIT', amount: 1800 },
    ]);
    // stamps the refund date
    const updateArgs = tx.deposit.update.mock.calls[0][0];
    expect(updateArgs.data.releasedDate).toBeInstanceOf(Date);
  });

  it('does not post a journal for non-refund transitions', async () => {
    const { service, journal } = await makeService(
      ContainerDepositStatus.EIR_DOCS_COLLECTED,
    );

    await service.updateStatus(
      'dep_1',
      ContainerDepositStatus.SUBMITTED_TO_SHIPPING_LINE,
      'user_1',
    );

    expect(journal.postJournal).not.toHaveBeenCalled();
  });
});
