import { Test } from '@nestjs/testing';
import { ContainerDepositStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
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
    deposit: {
      findUnique: jest.fn(() => Promise.resolve(deposit)),
    },
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
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const moduleRef = await Test.createTestingModule({
    providers: [
      DepositsService,
      { provide: PrismaService, useValue: prisma },
      { provide: JournalService, useValue: journal },
      { provide: AuditService, useValue: audit },
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
      ContainerDepositStatus.ORIGINAL_RECEIPT_COLLECTED,
      'user_1',
    );

    expect(journal.postJournal).not.toHaveBeenCalled();
  });
});

/**
 * syncForCostLine keeps the tracking deposit in step with its source cost line /
 * expense on edit — the fix for "editing a cost line doesn't relink the deposit".
 */
function buildSync(existing: Record<string, unknown> | null) {
  const deposit = {
    findFirst: jest.fn().mockResolvedValue(existing),
    update: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'dep_1', ...args.data }),
    ),
    delete: jest.fn().mockResolvedValue({ id: 'dep_1' }),
    create: jest.fn().mockResolvedValue({ id: 'dep_new' }),
    count: jest.fn().mockResolvedValue(0),
  };
  const prisma = {
    deposit,
    $transaction: jest.fn((cb: (t: { deposit: typeof deposit }) => unknown) =>
      cb({ deposit }),
    ),
  };
  const journal = { accountIdByCode: jest.fn(), postJournal: jest.fn() };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new DepositsService(
    prisma as unknown as PrismaService,
    journal as unknown as JournalService,
    audit as unknown as AuditService,
  );
  return { service, deposit };
}

const syncParams = {
  sourceExpenseId: 'exp_1',
  clearanceJobId: 'job_1',
  depositDate: '2026-07-31',
  amount: 200,
  shippingLine: 'EVER GREEN',
  volume: 2,
};

describe('DepositsService.syncForCostLine', () => {
  it('creates a tracking deposit when none exists and amount > 0', async () => {
    const { service, deposit } = buildSync(null);
    await service.syncForCostLine(syncParams, 'user_1');
    expect(deposit.create).toHaveBeenCalledTimes(1);
    expect(deposit.update).not.toHaveBeenCalled();
  });

  it('updates the existing deposit amount instead of duplicating it', async () => {
    const { service, deposit } = buildSync({
      id: 'dep_1',
      amount: 200,
      status: ContainerDepositStatus.EIR_DOCS_COLLECTED,
    });
    await service.syncForCostLine({ ...syncParams, amount: 50 }, 'user_1');
    expect(deposit.create).not.toHaveBeenCalled();
    expect(deposit.update).toHaveBeenCalledTimes(1);
    expect(deposit.update.mock.calls[0][0].data.amount).toBe(50);
  });

  it('removes the tracking deposit when the amount clears to zero', async () => {
    const { service, deposit } = buildSync({
      id: 'dep_1',
      amount: 200,
      status: ContainerDepositStatus.EIR_DOCS_COLLECTED,
    });
    await service.syncForCostLine({ ...syncParams, amount: 0 }, 'user_1');
    expect(deposit.delete).toHaveBeenCalledTimes(1);
  });

  it('leaves a refunded deposit untouched', async () => {
    const { service, deposit } = buildSync({
      id: 'dep_1',
      amount: 200,
      status: ContainerDepositStatus.DEPOSIT_REFUNDED,
    });
    await service.syncForCostLine({ ...syncParams, amount: 0 }, 'user_1');
    expect(deposit.delete).not.toHaveBeenCalled();
    expect(deposit.update).not.toHaveBeenCalled();
  });
});
