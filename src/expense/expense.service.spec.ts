import type { AuditService } from '../audit/audit.service';
import type { JournalService } from '../journal/journal.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ExpenseService } from './expense.service';
import type { CreateExpenseDto } from './dto/create-expense.dto';

/** tx captures the created expense data; $transaction runs the callback with it. */
function build() {
  const created: { data: Record<string, unknown> }[] = [];
  const tx = {
    expenseRecord: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        created.push(args);
        return Promise.resolve({ id: 'e_1', status: 'PENDING', ...args.data });
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ExpenseService(
    prisma as unknown as PrismaService,
    {} as JournalService,
    audit as unknown as AuditService,
  );
  return { service, created };
}

describe('ExpenseService.create', () => {
  it('computes taxAmount from taxRate (percentage)', async () => {
    const { service, created } = build();
    const dto: CreateExpenseDto = {
      recordDate: '2026-02-26',
      description: 'Clearance fee',
      expenseType: 'TECHNICAL_OPERATIONS',
      amount: 200,
      accountId: 'acc_1',
      taxRate: 10,
      deposit: 50,
      actualCost: 180,
    };

    await service.create(dto, 'user_1');

    const data = created[0].data;
    expect(data.taxAmount).toBe(20); // 200 * 10%
    expect(data.deposit).toBe(50);
    expect(data.actualCost).toBe(180);
  });

  it('leaves taxAmount undefined when no taxRate is given', async () => {
    const { service, created } = build();
    await service.create(
      {
        recordDate: '2026-02-26',
        description: 'Misc',
        expenseType: 'OTHER',
        amount: 100,
        accountId: 'acc_1',
      },
      'user_1',
    );
    expect(created[0].data.taxAmount).toBeUndefined();
  });
});
