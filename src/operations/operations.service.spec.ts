import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { OperationsService } from './operations.service';
import type { CreateClearanceJobDto } from './dto/create-clearance-job.dto';

function makePrisma() {
  const calls: { findMany?: unknown } = {};
  const clearanceJob = {
    create: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(args.data),
    ),
    findMany: jest.fn((args: unknown) => {
      calls.findMany = args;
      return Promise.resolve([]);
    }),
    count: jest.fn().mockResolvedValue(0),
  };
  const prisma = {
    clearanceJob,
    // Supports both the array form and the interactive-callback form.
    $transaction: jest.fn(
      (arg: Promise<unknown>[] | ((tx: unknown) => unknown)) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    ),
  };
  return { prisma: prisma as unknown as PrismaService, clearanceJob, calls };
}

const dto: CreateClearanceJobDto = {
  jobNumber: 'JOB-2026-001',
  date: '2026-05-22',
  customerId: 'cust_1',
};

describe('OperationsService', () => {
  it('maps a duplicate jobNumber to a ConflictException', async () => {
    const { prisma, clearanceJob } = makePrisma();
    clearanceJob.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '7',
      }),
    );
    const service = new OperationsService(prisma);

    await expect(service.create(dto, 'user_1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('keeps a manually entered job number', async () => {
    const { prisma } = makePrisma();
    const service = new OperationsService(prisma);

    const created = (await service.create(dto, 'user_1')) as {
      jobNumber: string;
    };
    expect(created.jobNumber).toBe('JOB-2026-001');
  });

  it('auto-generates the job number from the transaction type', async () => {
    const { prisma, clearanceJob } = makePrisma();
    clearanceJob.count.mockResolvedValue(4);
    const service = new OperationsService(prisma);

    const created = (await service.create(
      { date: '2026-05-22', customerId: 'cust_1', transaction: 'IMP' },
      'user_1',
    )) as { jobNumber: string; status: string };
    expect(created.jobNumber).toBe('IMP-2026-0005');
    expect(created.status).toBe('DRAFT_BL_RECEIVED');
  });

  it('searches by job number or BL/booking number', async () => {
    const { prisma, calls } = makePrisma();
    const service = new OperationsService(prisma);

    await service.findAll({
      page: 1,
      limit: 20,
      search: '026F5',
    });

    const where = (calls.findMany as { where: Prisma.ClearanceJobWhereInput })
      .where;
    expect(where.OR).toEqual([
      { jobNumber: { contains: '026F5', mode: 'insensitive' } },
      { blBookingNumber: { contains: '026F5', mode: 'insensitive' } },
    ]);
  });
});
