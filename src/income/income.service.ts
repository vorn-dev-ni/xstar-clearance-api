import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  AuditAction,
  EntryLineType,
  IncomeSource,
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

  /** Validate the serviceType code exists and is active (accounting-managed config). */
  private async assertServiceType(code: string) {
    const type = await this.prisma.serviceType.findUnique({ where: { code } });
    if (!type || !type.isActive) {
      throw new BadRequestException('Invalid or inactive service type');
    }
  }

  /**
   * Post an income record's revenue to the ledger: DR bank `1100` / CR the record's
   * revenue account for its amount. Reused by create and edit (after a reversal).
   */
  private async postIncomeJournal(
    tx: Prisma.TransactionClient,
    record: {
      id: string;
      description: string;
      amount: Prisma.Decimal;
      accountId: string;
      recordDate: Date;
    },
    userId: string,
  ) {
    const bankId = await this.journal.accountIdByCode(tx, ACCOUNT_CODES.BANK);
    const amount = Number(record.amount);
    return this.journal.postJournal(tx, {
      entryDate: record.recordDate,
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
  }

  /**
   * Record revenue that has already been received: create it and immediately post it
   * to the ledger as POSTED/APPROVED (there is no pending/approval step).
   */
  async create(dto: CreateIncomeDto, userId: string) {
    await this.assertServiceType(dto.serviceType);
    const record = await this.prisma.$transaction(async (tx) => {
      const recordNumber = await nextNumber(
        tx,
        'INC',
        new Date(dto.recordDate),
      );
      const created = await tx.incomeRecord.create({
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
      await this.postIncomeJournal(tx, created, userId);
      // Posted to the ledger immediately, but approval is a separate later sign-off,
      // so approvalStatus stays PENDING (its default).
      return tx.incomeRecord.update({
        where: { id: created.id },
        data: {
          status: TransactionStatus.POSTED,
          recordedDate: new Date(),
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

  /**
   * Auto-record revenue for a fully-paid invoice, inside the caller's payment transaction.
   * This row is REPORTING-ONLY: it surfaces the invoice in the income register and revenue
   * reports (which read IncomeRecord directly), but is NOT posted to the journal — the
   * invoice already booked A/R + revenue at finalize, so a journal post here would double
   * count revenue. Idempotent via the unique `invoiceId` (no-op if already linked).
   */
  async createFromInvoiceTx(
    tx: Prisma.TransactionClient,
    invoice: {
      id: string;
      invoiceNumber: string;
      customerId: string;
      totalAmount: Prisma.Decimal;
      currency: string;
      clearanceJobId: string | null;
    },
    paymentDate: Date,
    userId: string,
  ) {
    const existing = await tx.incomeRecord.findUnique({
      where: { invoiceId: invoice.id },
      select: { id: true },
    });
    if (existing) return existing;

    const customer = await tx.customer.findUnique({
      where: { id: invoice.customerId },
      select: { nameEn: true },
    });
    const accountId = await this.journal.accountIdByCode(
      tx,
      ACCOUNT_CODES.OPERATION_REVENUE,
    );
    const recordNumber = await nextNumber(tx, 'INC', paymentDate);
    // `amount` mirrors the full received amount (incl. VAT), matching how manual income
    // records book gross cash. Switch to invoice.subtotal if VAT should be excluded.
    return tx.incomeRecord.create({
      data: {
        recordNumber,
        recordDate: paymentDate,
        recordedDate: new Date(),
        description: `Invoice ${invoice.invoiceNumber}`,
        serviceType: 'OTHER',
        source: IncomeSource.INVOICE,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        clearanceJobId: invoice.clearanceJobId ?? undefined,
        amount: invoice.totalAmount,
        currency: invoice.currency,
        accountId,
        receivedFromName: customer?.nameEn,
        status: TransactionStatus.POSTED,
        createdBy: userId,
      },
    });
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
      approvalStatus: query.approvalStatus,
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
        orderBy: [{ createdAt: 'desc' }, { recordDate: 'desc' }],
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

  /**
   * Edit a recorded revenue. Since records are posted on create, the existing ledger
   * entry is reversed and re-posted with the new amount/account so account balances
   * stay correct. The record stays POSTED but is sent back for approval (PENDING).
   */
  async update(id: string, dto: UpdateIncomeDto, userId: string) {
    const existing = await this.findOne(id);
    if (existing.source === IncomeSource.INVOICE) {
      throw new BadRequestException(
        'Invoice-linked income is managed from the invoice and cannot be edited here',
      );
    }
    if (dto.serviceType) await this.assertServiceType(dto.serviceType);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.journal.reverseEntriesByReference(
        tx,
        ReferenceType.INCOME,
        id,
      );
      const record = await tx.incomeRecord.update({
        where: { id },
        data: {
          ...dto,
          recordDate: dto.recordDate ? new Date(dto.recordDate) : undefined,
          status: TransactionStatus.POSTED,
          approvalStatus: ApprovalStatus.PENDING,
          approvedBy: null,
          approvalDate: null,
        },
      });
      await this.postIncomeJournal(tx, record, userId);
      return record;
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

  /**
   * Approve: a management sign-off only. The record is already posted to the ledger
   * on create, so this just flips the approval badge — no journal/balance change.
   */
  async approve(id: string, userId: string) {
    await this.findOne(id);
    const updated = await this.prisma.incomeRecord.update({
      where: { id },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedBy: userId,
        approvalDate: new Date(),
        rejectionReason: null,
      },
    });
    await this.audit.log({
      userId,
      entityType: 'IncomeRecord',
      entityId: id,
      action: AuditAction.APPROVE,
      after: { approvalStatus: ApprovalStatus.APPROVED },
    });
    return {
      id: updated.id,
      status: updated.status,
      approvalStatus: updated.approvalStatus,
    };
  }

  /**
   * Reject: mark the approval REJECTED. The ledger is untouched (the money was
   * already received and posted); this is a review outcome only.
   */
  async reject(id: string, userId: string, rejectionReason?: string) {
    await this.findOne(id);
    const updated = await this.prisma.incomeRecord.update({
      where: { id },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        rejectionReason,
        approvedBy: userId,
        approvalDate: new Date(),
      },
    });
    await this.audit.log({
      userId,
      entityType: 'IncomeRecord',
      entityId: id,
      action: AuditAction.REJECT,
      after: { approvalStatus: ApprovalStatus.REJECTED, rejectionReason },
    });
    return {
      id: updated.id,
      status: updated.status,
      approvalStatus: updated.approvalStatus,
      rejectionReason: updated.rejectionReason,
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
