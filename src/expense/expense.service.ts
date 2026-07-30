import {
  BadRequestException,
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

  /** Validate the expenseType code exists and is active (accounting-managed config). */
  private async assertExpenseType(code: string) {
    const type = await this.prisma.expenseType.findUnique({ where: { code } });
    if (!type || !type.isActive) {
      throw new BadRequestException('Invalid or inactive expense type');
    }
  }

  async create(dto: CreateExpenseDto, userId: string) {
    await this.assertExpenseType(dto.expenseType);
    // A voucher's total is the sum of its line items; fall back to a flat
    // amount for legacy/single-line callers (B/L costing, clearance bills).
    const amount = resolveAmount(dto);
    // Prefer an explicit tax amount (B/L costing enters tax as money), else
    // derive it from the tax rate.
    const taxAmount =
      dto.taxAmount != null
        ? round2(dto.taxAmount)
        : dto.taxRate != null
          ? round2((amount * dto.taxRate) / 100)
          : 0;
    const hasTax = dto.taxAmount != null || dto.taxRate != null;
    // Actual cost mirrors the client's B/L costing formula:
    // Amount + Tax − Deposit (explicit override still honored).
    const actualCost =
      dto.actualCost ?? round2(amount + taxAmount - (dto.deposit ?? 0));
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
          amount,
          currency: dto.currency,
          accountId: dto.accountId,
          taxRate: dto.taxRate,
          taxAmount: hasTax ? taxAmount : undefined,
          deposit: dto.deposit,
          actualCost,
          invoiceNumber: dto.invoiceNumber,
          poNumber: dto.poNumber,
          referenceNumber: dto.referenceNumber,
          quantity: dto.quantity,
          unitCost: dto.unitCost,
          notes: dto.notes,
          attachmentUrl: dto.attachmentUrl,
          purpose: dto.purpose,
          accountNumber: dto.accountNumber,
          accountName: dto.accountName,
          cashAdvance: dto.cashAdvance ?? 0,
          paymentMethod: dto.paymentMethod,
          note: dto.note,
          createdBy: userId,
          items: dto.items?.length
            ? { create: dto.items.map(toItemCreate) }
            : undefined,
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
        orderBy: [{ createdAt: 'desc' }, { recordDate: 'desc' }],
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
        include: {
          supplier: { select: { id: true, nameEn: true } },
          account: { select: { code: true } },
          items: { orderBy: { itemNumber: 'asc' } },
        },
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
      include: {
        supplier: true,
        account: true,
        items: { orderBy: { itemNumber: 'asc' } },
      },
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
    if (dto.expenseType) await this.assertExpenseType(dto.expenseType);
    // `items` is a nested relation, not a scalar column — pull it out of the
    // spread and apply it as a replace-all below.
    const { items, recordDate, amount: _amount, ...rest } = dto;
    // Recompute tax + actual cost from the merged (existing + patch) values so
    // the B/L costing total stays consistent: actualCost = amount + tax − deposit.
    const amount = items?.length
      ? round2(items.reduce((s, i) => s + i.amount, 0))
      : (dto.amount ?? Number(existing.amount));
    const taxRate =
      dto.taxRate ??
      (existing.taxRate != null ? Number(existing.taxRate) : null);
    const deposit =
      dto.deposit ?? (existing.deposit != null ? Number(existing.deposit) : 0);
    const taxAmount =
      dto.taxAmount != null
        ? round2(dto.taxAmount)
        : taxRate != null
          ? round2((amount * taxRate) / 100)
          : existing.taxAmount != null
            ? Number(existing.taxAmount)
            : 0;
    const actualCost =
      dto.actualCost ?? round2(amount + taxAmount - (deposit ?? 0));
    const updated = await this.prisma.expenseRecord.update({
      where: { id },
      data: {
        ...rest,
        recordDate: recordDate ? new Date(recordDate) : undefined,
        amount,
        taxAmount,
        actualCost,
        // Editing an expense sends it back for approval.
        approvalStatus: ApprovalStatus.PENDING,
        status: TransactionStatus.PENDING,
        // Replace the voucher lines when a new set is supplied.
        ...(items
          ? {
              items: {
                deleteMany: {},
                create: items.map(toItemCreate),
              },
            }
          : {}),
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

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Voucher total = sum of item amounts, else the flat `amount` (legacy callers). */
function resolveAmount(dto: CreateExpenseDto): number {
  if (dto.items?.length) {
    return round2(dto.items.reduce((s, i) => s + i.amount, 0));
  }
  if (dto.amount == null) {
    throw new BadRequestException('Provide line items or an amount');
  }
  return dto.amount;
}

/** Map an item DTO to a Prisma nested-create row. */
function toItemCreate(i: {
  itemNumber: number;
  acCode?: string;
  itemDate?: string;
  invoiceNumber?: string;
  description: string;
  amount: number;
}): Prisma.ExpenseItemCreateWithoutExpenseRecordInput {
  return {
    itemNumber: i.itemNumber,
    acCode: i.acCode,
    itemDate: i.itemDate ? new Date(i.itemDate) : undefined,
    invoiceNumber: i.invoiceNumber,
    description: i.description,
    amount: i.amount,
  };
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
