import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AuditAction,
  EntryLineType,
  Prisma,
  ReferenceType,
  TransactionStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ACCOUNT_CODES } from '../common/accounting.constants';
import { monthYearRange } from '../common/date-range';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { JournalService } from '../journal/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIncomeDto } from './dto/create-income.dto';
import { ListIncomeDto } from './dto/list-income.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';

@Injectable()
export class IncomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateIncomeDto, userId: string) {
    const record = await this.prisma.$transaction(async (tx) => {
      const recordNumber = await nextNumber(
        tx,
        'INC',
        new Date(dto.recordDate),
      );
      return tx.incomeRecord.create({
        data: {
          recordNumber,
          recordDate: new Date(dto.recordDate),
          description: dto.description,
          serviceType: dto.serviceType,
          customerId: dto.customerId,
          clearanceJobId: dto.clearanceJobId,
          amount: dto.amount,
          currency: dto.currency,
          invoiceNumber: dto.invoiceNumber,
          billNumber: dto.billNumber,
          referenceNumber: dto.referenceNumber,
          accountId: dto.accountId,
          receivedFrom: dto.receivedFrom,
          receivedFromName: dto.receivedFromName,
          balance: dto.balance,
          containerCount: dto.containerCount,
          quantity: dto.quantity,
          unitPrice: dto.unitPrice,
          notes: dto.notes,
          attachmentUrl: dto.attachmentUrl,
          createdBy: userId,
        },
      });
    });
    await this.audit.log({
      userId,
      entityType: 'IncomeRecord',
      entityId: record.id,
      action: AuditAction.CREATE,
      after: { amount: Number(record.amount), status: record.status },
    });
    return {
      id: record.id,
      recordNumber: record.recordNumber,
      status: record.status,
      createdAt: record.createdAt,
    };
  }

  private buildWhere(query: ListIncomeDto): Prisma.IncomeRecordWhereInput {
    const recordDate =
      query.dateFrom || query.dateTo
        ? {
            gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
            lte: query.dateTo ? new Date(query.dateTo) : undefined,
          }
        : monthYearRange(query.month, query.year);
    return {
      status: query.status,
      serviceType: query.serviceType,
      customerId: query.customerId,
      clearanceJobId: query.clearanceJobId,
      recordDate,
    };
  }

  async findAll(query: ListIncomeDto) {
    const where = this.buildWhere(query);
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total, agg] = await this.prisma.$transaction([
      this.prisma.incomeRecord.findMany({
        where,
        include: { customer: { select: { id: true, nameEn: true } } },
        orderBy: { recordDate: 'desc' },
        skip,
        take,
      }),
      this.prisma.incomeRecord.count({ where }),
      this.prisma.incomeRecord.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      data: rows,
      pagination: paginationMeta(total, query.page, query.limit),
      summary: {
        totalIncome: Number(agg._sum.amount ?? 0),
        recordCount: total,
      },
    };
  }

  /** Unpaginated fetch for exports (capped at 1000 most recent). */
  async findAllForExport(query: ListIncomeDto) {
    const where = this.buildWhere(query);
    const [rows, agg] = await this.prisma.$transaction([
      this.prisma.incomeRecord.findMany({
        where,
        include: { customer: { select: { id: true, nameEn: true } } },
        orderBy: { recordDate: 'desc' },
        take: 1000,
      }),
      this.prisma.incomeRecord.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      rows,
      summary: {
        totalIncome: Number(agg._sum.amount ?? 0),
        recordCount: rows.length,
      },
    };
  }

  async findOne(id: string) {
    const record = await this.prisma.incomeRecord.findUnique({
      where: { id },
      include: { customer: true, account: true },
    });
    if (!record) throw new NotFoundException('Income record not found');
    return record;
  }

  async update(id: string, dto: UpdateIncomeDto, userId: string) {
    const existing = await this.findOne(id);
    if (existing.status === TransactionStatus.POSTED) {
      throw new UnprocessableEntityException(
        'Posted income records cannot be edited',
      );
    }
    const updated = await this.prisma.incomeRecord.update({
      where: { id },
      data: {
        ...dto,
        recordDate: dto.recordDate ? new Date(dto.recordDate) : undefined,
        status: TransactionStatus.PENDING,
      },
    });
    await this.audit.log({
      userId,
      entityType: 'IncomeRecord',
      entityId: id,
      action: AuditAction.UPDATE,
      before: { amount: Number(existing.amount) },
      after: { amount: Number(updated.amount) },
    });
    return updated;
  }

  /** Approve: mark POSTED and post DR bank / CR revenue journal. */
  async approve(id: string, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const record = await tx.incomeRecord.findUnique({ where: { id } });
      if (!record) throw new NotFoundException('Income record not found');
      if (record.status !== TransactionStatus.PENDING) {
        throw new UnprocessableEntityException(
          `Only PENDING income can be approved (current: ${record.status})`,
        );
      }

      const bankId = await this.journal.accountIdByCode(tx, ACCOUNT_CODES.BANK);
      const amount = Number(record.amount);
      const entry = await this.journal.postJournal(tx, {
        entryDate: new Date(),
        description: `Income: ${record.description}`,
        referenceType: ReferenceType.INCOME,
        referenceId: record.id,
        incomeRecordId: record.id,
        createdBy: userId,
        lines: [
          { accountId: bankId, entryType: EntryLineType.DEBIT, amount },
          {
            accountId: record.accountId,
            entryType: EntryLineType.CREDIT,
            amount,
          },
        ],
      });

      const updated = await tx.incomeRecord.update({
        where: { id },
        data: { status: TransactionStatus.POSTED, recordedDate: new Date() },
      });
      return { updated, entry };
    });

    await this.audit.log({
      userId,
      entityType: 'IncomeRecord',
      entityId: id,
      action: AuditAction.APPROVE,
      after: { status: TransactionStatus.POSTED },
    });

    return {
      id: result.updated.id,
      status: result.updated.status,
      journalEntryId: result.entry.id,
      approvedAt: result.updated.recordedDate,
    };
  }
}

/** Per-year sequential record number derived inside the caller's transaction. */
async function nextNumber(
  tx: Prisma.TransactionClient,
  prefix: string,
  date: Date,
): Promise<string> {
  const year = date.getUTCFullYear();
  const count = await tx.incomeRecord.count({
    where: { recordNumber: { startsWith: `${prefix}-${year}-` } },
  });
  return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;
}
