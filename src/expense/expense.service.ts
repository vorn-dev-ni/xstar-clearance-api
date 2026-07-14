import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApprovalStatus,
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
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

@Injectable()
export class ExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateExpenseDto, userId: string) {
    const record = await this.prisma.$transaction(async (tx) => {
      const recordNumber = await nextNumber(
        tx,
        'EXP',
        new Date(dto.recordDate),
      );
      return tx.expenseRecord.create({
        data: {
          recordNumber,
          recordDate: new Date(dto.recordDate),
          description: dto.description,
          expenseType: dto.expenseType,
          supplierId: dto.supplierId,
          supplierName: dto.supplierName,
          clearanceJobId: dto.clearanceJobId,
          amount: dto.amount,
          currency: dto.currency,
          accountId: dto.accountId,
          taxRate: dto.taxRate,
          taxAmount:
            dto.taxRate != null
              ? Math.round(dto.amount * dto.taxRate) / 100
              : undefined,
          deposit: dto.deposit,
          actualCost: dto.actualCost,
          invoiceNumber: dto.invoiceNumber,
          poNumber: dto.poNumber,
          referenceNumber: dto.referenceNumber,
          quantity: dto.quantity,
          unitCost: dto.unitCost,
          notes: dto.notes,
          attachmentUrl: dto.attachmentUrl,
          createdBy: userId,
        },
      });
    });
    await this.audit.log({
      userId,
      entityType: 'ExpenseRecord',
      entityId: record.id,
      action: AuditAction.CREATE,
      after: { amount: Number(record.amount) },
    });
    return {
      id: record.id,
      recordNumber: record.recordNumber,
      status: record.status,
      approvalStatus: record.approvalStatus,
      createdAt: record.createdAt,
    };
  }

  private buildWhere(query: ListExpensesDto): Prisma.ExpenseRecordWhereInput {
    const recordDate =
      query.dateFrom || query.dateTo
        ? {
            gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
            lte: query.dateTo ? new Date(query.dateTo) : undefined,
          }
        : monthYearRange(query.month, query.year);
    return {
      status: query.status,
      approvalStatus: query.approvalStatus,
      expenseType: query.expenseType,
      supplierId: query.supplierId,
      clearanceJobId: query.clearanceJobId,
      recordDate,
    };
  }

  async findAll(query: ListExpensesDto) {
    const where = this.buildWhere(query);
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total, totalAgg, pendingAgg] = await this.prisma.$transaction([
      this.prisma.expenseRecord.findMany({
        where,
        include: { supplier: { select: { id: true, nameEn: true } } },
        orderBy: { recordDate: 'desc' },
        skip,
        take,
      }),
      this.prisma.expenseRecord.count({ where }),
      this.prisma.expenseRecord.aggregate({ where, _sum: { amount: true } }),
      this.prisma.expenseRecord.aggregate({
        where: { ...where, approvalStatus: ApprovalStatus.PENDING },
        _sum: { amount: true },
      }),
    ]);
    return {
      data: rows,
      pagination: paginationMeta(total, query.page, query.limit),
      summary: {
        totalExpenses: Number(totalAgg._sum.amount ?? 0),
        pendingApproval: Number(pendingAgg._sum.amount ?? 0),
      },
    };
  }

  /** Unpaginated fetch for exports (capped at 1000 most recent). */
  async findAllForExport(query: ListExpensesDto) {
    const where = this.buildWhere(query);
    const [rows, agg] = await this.prisma.$transaction([
      this.prisma.expenseRecord.findMany({
        where,
        include: { supplier: { select: { id: true, nameEn: true } } },
        orderBy: { recordDate: 'desc' },
        take: 1000,
      }),
      this.prisma.expenseRecord.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      rows,
      summary: {
        totalExpenses: Number(agg._sum.amount ?? 0),
        recordCount: rows.length,
      },
    };
  }

  async findOne(id: string) {
    const record = await this.prisma.expenseRecord.findUnique({
      where: { id },
      include: { supplier: true, account: true },
    });
    if (!record) throw new NotFoundException('Expense record not found');
    return record;
  }

  async update(id: string, dto: UpdateExpenseDto, userId: string) {
    const existing = await this.findOne(id);
    if (existing.status === TransactionStatus.POSTED) {
      throw new UnprocessableEntityException(
        'Posted expense records cannot be edited',
      );
    }
    const updated = await this.prisma.expenseRecord.update({
      where: { id },
      data: {
        ...dto,
        recordDate: dto.recordDate ? new Date(dto.recordDate) : undefined,
        // Editing an expense sends it back for approval.
        approvalStatus: ApprovalStatus.PENDING,
        status: TransactionStatus.PENDING,
      },
    });
    await this.audit.log({
      userId,
      entityType: 'ExpenseRecord',
      entityId: id,
      action: AuditAction.UPDATE,
      before: { amount: Number(existing.amount) },
      after: { amount: Number(updated.amount) },
    });
    return updated;
  }

  /** Approve (Manager/Admin): mark APPROVED + POSTED, DR expense / CR A/P. */
  async approve(id: string, userId: string, notes?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const record = await tx.expenseRecord.findUnique({ where: { id } });
      if (!record) throw new NotFoundException('Expense record not found');
      if (record.approvalStatus === ApprovalStatus.APPROVED) {
        throw new UnprocessableEntityException('Expense is already approved');
      }

      const payableId = await this.journal.accountIdByCode(
        tx,
        ACCOUNT_CODES.ACCOUNTS_PAYABLE,
      );
      const amount = Number(record.amount);
      const entry = await this.journal.postJournal(tx, {
        entryDate: new Date(),
        description: `Expense: ${record.description}`,
        referenceType: ReferenceType.EXPENSE,
        referenceId: record.id,
        expenseRecordId: record.id,
        memo: notes,
        createdBy: userId,
        lines: [
          {
            accountId: record.accountId,
            entryType: EntryLineType.DEBIT,
            amount,
          },
          {
            accountId: payableId,
            entryType: EntryLineType.CREDIT,
            amount,
          },
        ],
      });

      const updated = await tx.expenseRecord.update({
        where: { id },
        data: {
          approvalStatus: ApprovalStatus.APPROVED,
          approvedBy: userId,
          approvalDate: new Date(),
          status: TransactionStatus.POSTED,
          recordedDate: new Date(),
        },
      });
      return { updated, entry };
    });

    await this.audit.log({
      userId,
      entityType: 'ExpenseRecord',
      entityId: id,
      action: AuditAction.APPROVE,
      after: { approvalStatus: ApprovalStatus.APPROVED },
    });

    return {
      id: result.updated.id,
      approvalStatus: result.updated.approvalStatus,
      approvedBy: result.updated.approvedBy,
      approvalDate: result.updated.approvalDate,
      status: result.updated.status,
      journalEntryId: result.entry.id,
    };
  }

  async reject(id: string, userId: string, rejectionReason?: string) {
    const record = await this.findOne(id);
    if (record.status === TransactionStatus.POSTED) {
      throw new UnprocessableEntityException(
        'Posted expenses cannot be rejected',
      );
    }
    const updated = await this.prisma.expenseRecord.update({
      where: { id },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        rejectionReason,
        status: TransactionStatus.PENDING,
      },
    });
    await this.audit.log({
      userId,
      entityType: 'ExpenseRecord',
      entityId: id,
      action: AuditAction.REJECT,
      after: { approvalStatus: ApprovalStatus.REJECTED, rejectionReason },
    });
    return {
      id: updated.id,
      approvalStatus: updated.approvalStatus,
      rejectionReason: updated.rejectionReason,
      status: updated.status,
    };
  }
}

async function nextNumber(
  tx: Prisma.TransactionClient,
  prefix: string,
  date: Date,
): Promise<string> {
  const year = date.getUTCFullYear();
  const count = await tx.expenseRecord.count({
    where: { recordNumber: { startsWith: `${prefix}-${year}-` } },
  });
  return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;
}
