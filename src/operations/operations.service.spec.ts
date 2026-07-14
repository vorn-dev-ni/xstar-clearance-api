import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { OperationsService } from './operations.service';
import type { CreateClearanceJobDto } from './dto/create-clearance-job.dto';

function makePrisma() {
  const calls: { findMany?: unknown } = {};
  const clearanceJob = {
    create: jest.fn(),
    findMany: jest.fn((args: unknown) => {
      calls.findMany = args;
      return Promise.resolve([]);
    }),
    count: jest.fn().mockResolvedValue(0),
  };
  const prisma = {
    clearanceJob,
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
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
