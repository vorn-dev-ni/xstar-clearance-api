import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  ContainerDepositStatus,
  EntryLineType,
  Prisma,
  ReferenceType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ACCOUNT_CODES } from '../common/accounting.constants';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { JournalService } from '../journal/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { ListDepositsDto } from './dto/list-deposits.dto';

const depositInclude = {
  customer: { select: { nameEn: true } },
  supplier: { select: { nameEn: true } },
  account: { select: { code: true, nameEn: true } },
  clearanceJob: { select: { jobNumber: true, blBookingNumber: true } },
} satisfies Prisma.DepositInclude;

/** Ordered container-deposit refund lifecycle. Status may only move ±1 step. */
const DEPOSIT_LIFECYCLE: ContainerDepositStatus[] = [
  ContainerDepositStatus.EIR_DOCS_COLLECTED,
  ContainerDepositStatus.ORIGINAL_RECEIPT_COLLECTED,
  ContainerDepositStatus.SUBMITTED_TO_SHIPPING_LINE,
  ContainerDepositStatus.AWAITING_DEPOSIT_REFUND,
  ContainerDepositStatus.DEPOSIT_REFUNDED,
];

@Injectable()
export class DepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
  ) {}

  /** Create a container deposit and post DR deposit account / CR bank. */
  async create(dto: CreateDepositDto, userId: string) {
    const deposit = await this.prisma.$transaction(async (tx) => {
      const depositNumber = await nextDepositNumber(
        tx,
        new Date(dto.depositDate),
      );
      const deposit = await tx.deposit.create({
        data: {
          depositNumber,
          depositDate: new Date(dto.depositDate),
          customerId: dto.customerId,
          supplierId: dto.supplierId,
          clearanceJobId: dto.clearanceJobId,
          amount: dto.amount,
          currency: dto.currency,
          purpose: dto.purpose,
          shippingLine: dto.shippingLine,
          volume: dto.volume,
          accountId: dto.accountId,
          notes: dto.notes,
          createdBy: userId,
        },
        include: depositInclude,
      });

      const bankId = await this.journal.accountIdByCode(tx, ACCOUNT_CODES.BANK);
      await this.journal.postJournal(tx, {
        entryDate: new Date(dto.depositDate),
        description: `Deposit ${deposit.depositNumber}: ${deposit.purpose}`,
        referenceType: ReferenceType.DEPOSIT,
        referenceId: deposit.id,
        createdBy: userId,
        lines: [
          {
            accountId: dto.accountId,
            entryType: EntryLineType.DEBIT,
            amount: dto.amount,
          },
          {
            accountId: bankId,
            entryType: EntryLineType.CREDIT,
            amount: dto.amount,
          },
        ],
      });

      return deposit;
    });
    await this.audit.log({
      userId,
      entityType: 'Deposit',
      entityId: deposit.id,
      action: AuditAction.CREATE,
      after: {
        depositNumber: deposit.depositNumber,
        amount: Number(deposit.amount),
      },
    });
    return deposit;
  }

  /**
   * Create a tracking-only container deposit from a BL-costing cost line. It is
   * NOT posted to the ledger (accountId stays null → no journal on create or
   * refund) — the cash is already represented by the cost line. It still flows
   * through the normal refund status stepper.
   */
  async createForCostLine(
    params: {
      clearanceJobId: string;
      depositDate: string;
      amount: number;
      shippingLine?: string;
      volume?: number;
      sourceExpenseId: string;
    },
    userId: string,
  ) {
    // Remark is intentionally NOT carried from the cost line — it is captured
    // later at the AWAITING_DEPOSIT_REFUND step.
    const deposit = await this.prisma.$transaction((tx) =>
      nextDepositNumber(tx, new Date(params.depositDate)).then(
        (depositNumber) =>
          tx.deposit.create({
            data: {
              depositNumber,
              depositDate: new Date(params.depositDate),
              clearanceJobId: params.clearanceJobId,
              amount: params.amount,
              purpose: 'Container Deposit',
              shippingLine: params.shippingLine,
              volume: params.volume,
              sourceExpenseId: params.sourceExpenseId,
              createdBy: userId,
            },
            include: depositInclude,
          }),
      ),
    );
    await this.audit.log({
      userId,
      entityType: 'Deposit',
      entityId: deposit.id,
      action: AuditAction.CREATE,
      after: {
        depositNumber: deposit.depositNumber,
        amount: Number(deposit.amount),
        sourceExpenseId: params.sourceExpenseId,
      },
    });
    return deposit;
  }

  /**
   * Reconcile the tracking container deposit for a source cost line / expense.
   * Called after an expense (BL-costing cost line or job-tagged voucher) is
   * created or edited, so the deposit tracker always mirrors the cost line:
   *  - amount > 0, none yet → create a tracking-only deposit (via createForCostLine)
   *  - amount > 0, one exists → update its amount/date/shipping line/volume
   *  - amount <= 0, one exists → delete it (unless already refunded)
   * A refunded deposit is terminal, so its amount is never mutated or removed here.
   */
  async syncForCostLine(
    params: {
      sourceExpenseId: string;
      clearanceJobId: string;
      depositDate: string;
      amount: number;
      shippingLine?: string;
      volume?: number;
    },
    userId: string,
  ) {
    const existing = await this.prisma.deposit.findFirst({
      where: { sourceExpenseId: params.sourceExpenseId },
    });
    const amount = params.amount ?? 0;

    if (amount > 0) {
      if (!existing) {
        return this.createForCostLine(params, userId);
      }
      // Refunded deposits are locked — leave them exactly as they are.
      if (existing.status === ContainerDepositStatus.DEPOSIT_REFUNDED) {
        return existing;
      }
      const updated = await this.prisma.deposit.update({
        where: { id: existing.id },
        data: {
          amount,
          depositDate: new Date(params.depositDate),
          shippingLine: params.shippingLine,
          volume: params.volume,
        },
        include: depositInclude,
      });
      await this.audit.log({
        userId,
        entityType: 'Deposit',
        entityId: updated.id,
        action: AuditAction.UPDATE,
        before: { amount: Number(existing.amount) },
        after: { amount: Number(updated.amount) },
      });
      return updated;
    }

    // Deposit cleared to zero → remove the tracking record, unless it already
    // completed its refund lifecycle (kept for the audit trail).
    if (
      existing &&
      existing.status !== ContainerDepositStatus.DEPOSIT_REFUNDED
    ) {
      await this.prisma.deposit.delete({ where: { id: existing.id } });
      await this.audit.log({
        userId,
        entityType: 'Deposit',
        entityId: existing.id,
        action: AuditAction.DELETE,
        before: { amount: Number(existing.amount) },
      });
    }
    return null;
  }

  async findAll(query: ListDepositsDto) {
    const where = buildWhere(query);
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.deposit.findMany({
        where,
        include: depositInclude,
        orderBy: [{ createdAt: 'desc' }, { depositDate: 'desc' }],
        skip,
        take,
      }),
      this.prisma.deposit.count({ where }),
    ]);
    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }

  async findOne(id: string) {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id },
      include: depositInclude,
    });
    if (!deposit) throw new NotFoundException('Deposit not found');
    return deposit;
  }

  /**
   * Advance a container deposit through its refund lifecycle. When it reaches
   * DEPOSIT_REFUNDED, post the reversing entry (DR bank / CR the deposit
   * account) so the deposit clears off the books, and stamp the refund date.
   */
  async updateStatus(
    id: string,
    status: ContainerDepositStatus,
    userId: string,
    opts?: { refundRequestDate?: string; remark?: string },
  ) {
    const deposit = await this.prisma.deposit.findUnique({ where: { id } });
    if (!deposit) throw new NotFoundException('Deposit not found');

    // Refunded is terminal — fully locked once reached.
    if (deposit.status === ContainerDepositStatus.DEPOSIT_REFUNDED) {
      throw new ConflictException('Refunded deposits are locked');
    }
    // Only single-step moves (forward or back); no skipping.
    const from = DEPOSIT_LIFECYCLE.indexOf(deposit.status);
    const to = DEPOSIT_LIFECYCLE.indexOf(status);
    if (to < 0 || Math.abs(to - from) !== 1) {
      throw new ConflictException('Status can only move one step at a time');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const becomingRefunded =
        status === ContainerDepositStatus.DEPOSIT_REFUNDED &&
        deposit.status !== ContainerDepositStatus.DEPOSIT_REFUNDED;
      // Capture the refund request date + remark when moving into that stage.
      // The date defaults to today; the remark is entered by the user there.
      const requestingRefund =
        status === ContainerDepositStatus.AWAITING_DEPOSIT_REFUND;

      const updated = await tx.deposit.update({
        where: { id },
        data: {
          status,
          releasedDate: becomingRefunded ? new Date() : deposit.releasedDate,
          // Full refund on completion; Balance = amount − refundedAmount.
          refundedAmount: becomingRefunded ? deposit.amount : undefined,
          refundRequestDate: requestingRefund
            ? opts?.refundRequestDate
              ? new Date(opts.refundRequestDate)
              : new Date()
            : undefined,
          notes: requestingRefund && opts?.remark ? opts.remark : undefined,
        },
        include: depositInclude,
      });

      // Only ledger-posted deposits (manual, with an account) reverse on refund;
      // tracking-only deposits from BL costing (accountId null) skip the journal.
      if (becomingRefunded && deposit.accountId) {
        const bankId = await this.journal.accountIdByCode(
          tx,
          ACCOUNT_CODES.BANK,
        );
        await this.journal.postJournal(tx, {
          entryDate: new Date(),
          description: `Deposit refund ${deposit.depositNumber}: ${deposit.purpose}`,
          referenceType: ReferenceType.DEPOSIT,
          referenceId: deposit.id,
          createdBy: userId,
          lines: [
            {
              accountId: bankId,
              entryType: EntryLineType.DEBIT,
              amount: Number(deposit.amount),
            },
            {
              accountId: deposit.accountId,
              entryType: EntryLineType.CREDIT,
              amount: Number(deposit.amount),
            },
          ],
        });
      }

      return updated;
    });
    await this.audit.log({
      userId,
      entityType: 'Deposit',
      entityId: id,
      action: AuditAction.UPDATE,
      before: { status: deposit.status },
      after: { status: updated.status },
    });
    return updated;
  }
}

function buildWhere(query: ListDepositsDto): Prisma.DepositWhereInput {
  const depositDate =
    query.dateFrom || query.dateTo
      ? {
          gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
          lte: query.dateTo ? new Date(query.dateTo) : undefined,
        }
      : undefined;
  return {
    status: query.status,
    customerId: query.customerId,
    supplierId: query.supplierId,
    clearanceJobId: query.clearanceJobId,
    depositNumber: query.search
      ? { contains: query.search, mode: 'insensitive' }
      : undefined,
    depositDate,
  };
}

async function nextDepositNumber(
  tx: Prisma.TransactionClient,
  date: Date,
): Promise<string> {
  const year = date.getUTCFullYear();
  const count = await tx.deposit.count({
    where: { depositNumber: { startsWith: `DEP-${year}-` } },
  });
  return `DEP-${year}-${String(count + 1).padStart(4, '0')}`;
}
