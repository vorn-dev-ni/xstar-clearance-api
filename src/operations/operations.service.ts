import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import {
  BillExpenseItemDto,
  BillRecordItemDto,
  CreateClearanceJobDto,
} from './dto/create-clearance-job.dto';
import { ListClearanceJobsDto } from './dto/list-clearance-jobs.dto';
import { UpdateClearanceJobDto } from './dto/update-clearance-job.dto';

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClearanceJobDto, userId: string) {
    const {
      recordItems,
      expenseItems,
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      createdBy: _createdBy,
      customer: _customer,
      assignedStaffUser: _assignedStaffUser,
      incomeRecord: _incomeRecord,
      expenses: _expenses,
      incomes: _incomes,
      financials: _financials,
      ...rest
    } = dto as Record<string, any>;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const jobNumber =
          dto.jobNumber ||
          (await nextJobNumber(tx, dto.transaction, new Date(dto.date)));

        let assignedStaffName = dto.assignedStaff;
        if (dto.assignedStaffId && !assignedStaffName) {
          const staffUser = await tx.user.findUnique({
            where: { id: dto.assignedStaffId },
            select: { firstName: true, lastName: true },
          });
          if (staffUser) {
            assignedStaffName =
              `${staffUser.firstName} ${staffUser.lastName}`.trim();
          }
        }

        return tx.clearanceJob.create({
          data: {
            ...rest,
            assignedStaff: assignedStaffName,
            jobNumber,
            date: new Date(dto.date),
            eta: dto.eta ? new Date(dto.eta) : undefined,
            issueClearanceDate: dto.issueClearanceDate
              ? new Date(dto.issueClearanceDate)
              : undefined,
            status: dto.status ?? JobStatus.DRAFT_BL_RECEIVED,
            createdBy: userId,
            ...itemWrites(recordItems, expenseItems),
          } as Prisma.ClearanceJobUncheckedCreateInput,
        });
      });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  /** Predicted next auto job number — the actual number is assigned at save. */
  async nextNumber(transaction?: string) {
    const jobNumber = await nextJobNumber(this.prisma, transaction, new Date());
    return { jobNumber };
  }

  async findAll(query: ListClearanceJobsDto) {
    const where: Prisma.ClearanceJobWhereInput = {
      customerId: query.customerId,
      status: query.status,
      shipmentStatus: query.shipmentStatus,
      ...(query.search
        ? {
            OR: [
              { jobNumber: { contains: query.search, mode: 'insensitive' } },
              {
                blBookingNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.clearanceJob.findMany({
        where,
        include: {
          customer: { select: { nameEn: true } },
          assignedStaffUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      this.prisma.clearanceJob.count({ where }),
    ]);
    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }

  async findOne(id: string) {
    const job = await this.prisma.clearanceJob.findUnique({
      where: { id },
      include: {
        customer: true,
        assignedStaffUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            department: true,
          },
        },
        incomeRecord: true,
        recordItems: { orderBy: { itemNumber: 'asc' } },
        expenseItems: { orderBy: { itemNumber: 'asc' } },
        expenses: {
          select: {
            id: true,
            recordNumber: true,
            recordDate: true,
            description: true,
            amount: true,
            currency: true,
            status: true,
            approvalStatus: true,
          },
          orderBy: { recordDate: 'desc' },
        },
        incomes: {
          select: {
            id: true,
            recordNumber: true,
            recordDate: true,
            description: true,
            amount: true,
            currency: true,
            status: true,
          },
          orderBy: { recordDate: 'desc' },
        },
        deposits: {
          select: {
            id: true,
            depositNumber: true,
            depositDate: true,
            amount: true,
            currency: true,
            status: true,
            releasedDate: true,
          },
          orderBy: { depositDate: 'desc' },
        },
      },
    });
    if (!job) throw new NotFoundException('Clearance job not found');

    const actualRevenue = sumAmounts(job.incomes);
    const actualCost = sumAmounts(job.expenses);
    const estimatedRevenue =
      job.estimatedRevenue != null ? Number(job.estimatedRevenue) : null;
    const estimatedCost =
      job.estimatedCost != null ? Number(job.estimatedCost) : null;
    return {
      ...job,
      financials: {
        actualRevenue,
        actualCost,
        profit: actualRevenue - actualCost,
        estimatedRevenue,
        estimatedCost,
        estimatedProfit:
          estimatedRevenue != null || estimatedCost != null
            ? (estimatedRevenue ?? 0) - (estimatedCost ?? 0)
            : null,
      },
    };
  }

  async update(id: string, dto: UpdateClearanceJobDto) {
    await this.findOne(id);
    const {
      recordItems,
      expenseItems,
      id: _id,
      jobNumber: _jobNumber,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      createdBy: _createdBy,
      customer: _customer,
      assignedStaffUser: _assignedStaffUser,
      incomeRecord: _incomeRecord,
      expenses: _expenses,
      incomes: _incomes,
      financials: _financials,
      ...rest
    } = dto as Record<string, any>;

    let assignedStaffName = rest.assignedStaff;
    if (rest.assignedStaffId && rest.assignedStaff === undefined) {
      const staffUser = await this.prisma.user.findUnique({
        where: { id: rest.assignedStaffId },
        select: { firstName: true, lastName: true },
      });
      if (staffUser) {
        assignedStaffName =
          `${staffUser.firstName} ${staffUser.lastName}`.trim();
      }
    }

    try {
      return await this.prisma.clearanceJob.update({
        where: { id },
        data: {
          ...rest,
          ...(assignedStaffName !== undefined
            ? { assignedStaff: assignedStaffName }
            : {}),
          ...(dto.date ? { date: new Date(dto.date) } : {}),
          ...(dto.eta ? { eta: new Date(dto.eta) } : {}),
          ...(dto.issueClearanceDate
            ? { issueClearanceDate: new Date(dto.issueClearanceDate) }
            : {}),
          // Array provided (even empty) → full replace of the inline rows.
          ...(recordItems !== undefined
            ? {
                recordItems: {
                  deleteMany: {},
                  create: recordItems.map(withComputedAmount),
                },
              }
            : {}),
          ...(expenseItems !== undefined
            ? {
                expenseItems: {
                  deleteMany: {},
                  create: expenseItems.map(cleanExpenseItem),
                },
              }
            : {}),
        } as Prisma.ClearanceJobUncheckedUpdateInput,
      });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  private mapUniqueError(e: unknown): unknown {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException(
        'A clearance job with this job number already exists',
      );
    }
    return e;
  }
}

function sumAmounts(rows: { amount: Prisma.Decimal }[]): number {
  return rows.reduce((sum, r) => sum + Number(r.amount), 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function withComputedAmount(item: BillRecordItemDto, idx: number) {
  const { id, clearanceJobId, ...cleanItem } = item as Record<string, any>;
  return {
    ...cleanItem,
    itemNumber: cleanItem.itemNumber ?? idx + 1,
    amount: round2(
      Number(cleanItem.quantity ?? 0) * Number(cleanItem.unitPrice ?? 0),
    ),
  };
}

function cleanExpenseItem(item: BillExpenseItemDto, idx: number) {
  const { id, clearanceJobId, ...cleanItem } = item as Record<string, any>;
  return {
    ...cleanItem,
    itemNumber: cleanItem.itemNumber ?? idx + 1,
    amount: round2(Number(cleanItem.amount ?? 0)),
  };
}

function itemWrites(
  recordItems?: BillRecordItemDto[],
  expenseItems?: BillExpenseItemDto[],
) {
  return {
    ...(recordItems?.length
      ? { recordItems: { create: recordItems.map(withComputedAmount) } }
      : {}),
    ...(expenseItems?.length
      ? { expenseItems: { create: expenseItems.map(cleanExpenseItem) } }
      : {}),
  };
}

/** IMP/EXP prefix from the transaction field, else JOB; per-year sequence. */
async function nextJobNumber(
  tx: Pick<Prisma.TransactionClient, 'clearanceJob'>,
  transaction: string | undefined,
  date: Date,
): Promise<string> {
  const t = transaction?.trim().toUpperCase() ?? '';
  const prefix = t.startsWith('IMP')
    ? 'IMP'
    : t.startsWith('EXP')
      ? 'EXP'
      : 'JOB';
  const year = date.getUTCFullYear();
  const count = await tx.clearanceJob.count({
    where: { jobNumber: { startsWith: `${prefix}-${year}-` } },
  });
  return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;
}
