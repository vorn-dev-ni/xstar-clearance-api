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
import { DepositsService } from '../deposits/deposits.service';
import { JournalService } from '../journal/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';
import { PayBillDto } from './dto/pay-bill.dto';
import { PayBillsDto } from './dto/pay-bills.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

@Injectable()
export class ExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
    private readonly deposits: DepositsService,
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
    const hasItems = !!dto.items?.length;
    // With line items, record-level tax/deposit are the sum of the item lines
    // (each item mirrors a B/L cost line). Flat callers (B/L costing "Add cost")
    // keep entering tax/deposit at the record level.
    const taxAmount = hasItems
      ? sumItems(dto.items, 'tax')
      : dto.taxAmount != null
        ? round2(dto.taxAmount)
        : dto.taxRate != null
          ? round2((amount * dto.taxRate) / 100)
          : 0;
    const hasTax = hasItems || dto.taxAmount != null || dto.taxRate != null;
    const deposit = hasItems
      ? sumItems(dto.items, 'deposit')
      : (dto.deposit ?? 0);
    // Actual cost mirrors the client's B/L costing formula:
    // Amount + Tax − Deposit (explicit override still honored).
    const actualCost = dto.actualCost ?? round2(amount + taxAmount - deposit);
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
          deposit: hasItems ? deposit : dto.deposit,
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
    // Keep the shipment's container-deposit tracker in step with this expense.
    await this.reconcileJobDeposit(
      record,
      deposit,
      dto.shippingLine,
      dto.volume,
      userId,
    );
    return {
      id: record.id,
      recordNumber: record.recordNumber,
      status: record.status,
      approvalStatus: record.approvalStatus,
      createdAt: record.createdAt,
    };
  }

  /**
   * Mirror an expense's deposit into the shipment's container-deposit tracker.
   * Only job-tagged expenses (BL-costing cost lines or vouchers linked to a
   * shipment) participate — matched purely by clearance job, no B/L required.
   */
  private async reconcileJobDeposit(
    record: { id: string; clearanceJobId: string | null; recordDate: Date },
    deposit: number,
    shippingLine: string | undefined,
    volume: number | undefined,
    userId: string,
  ) {
    if (!record.clearanceJobId) return;
    await this.deposits.syncForCostLine(
      {
        sourceExpenseId: record.id,
        clearanceJobId: record.clearanceJobId,
        depositDate: record.recordDate.toISOString(),
        amount: deposit,
        shippingLine,
        volume,
      },
      userId,
    );
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
      ...(query.search
        ? {
            OR: [
              { recordNumber: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              {
                invoiceNumber: { contains: query.search, mode: 'insensitive' },
              },
              {
                supplierName: { contains: query.search, mode: 'insensitive' },
              },
              {
                supplier: {
                  nameEn: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
  }

  async findAll(query: ListExpensesDto) {
    const where = this.buildWhere(query);
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total, totalAgg, pendingAgg] = await this.prisma.$transaction([
      this.prisma.expenseRecord.findMany({
        where,
        include: {
          supplier: { select: { id: true, nameEn: true } },
          clearanceJob: { select: { id: true, jobNumber: true } },
          vendorPayments: { select: { amount: true } },
        },
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
      data: rows.map(({ vendorPayments, ...rest }) => ({
        ...rest,
        ...paymentSummary(rest.amount, vendorPayments),
      })),
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
          items: {
            orderBy: { itemNumber: 'asc' },
            include: { account: { select: { code: true } } },
          },
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
        items: {
          orderBy: { itemNumber: 'asc' },
          include: { account: { select: { code: true, nameEn: true } } },
        },
        vendorPayments: { orderBy: { paymentDate: 'desc' } },
      },
    });
    if (!record) throw new NotFoundException('Expense record not found');
    return {
      ...record,
      ...paymentSummary(record.amount, record.vendorPayments),
    };
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
    // spread and apply it as a replace-all below. `shippingLine`/`volume` are
    // not ExpenseRecord columns either; they flow to the linked deposit. The
    // recomputed `amount` below overrides any value left in `...rest`.
    const { items, recordDate, shippingLine, volume, ...rest } = dto;
    // Recompute tax + actual cost from the merged (existing + patch) values so
    // the B/L costing total stays consistent: actualCost = amount + tax − deposit.
    const hasItems = !!items?.length;
    const amount = hasItems
      ? round2((items ?? []).reduce((s, i) => s + i.amount, 0))
      : (dto.amount ?? Number(existing.amount));
    const taxRate =
      dto.taxRate ??
      (existing.taxRate != null ? Number(existing.taxRate) : null);
    // With items, record-level tax/deposit are the item sums; otherwise fall back
    // to the patch value or the existing record (flat B/L costing lines).
    const existingDeposit =
      existing.deposit != null ? Number(existing.deposit) : 0;
    const deposit = hasItems
      ? sumItems(items, 'deposit')
      : (dto.deposit ?? existingDeposit);
    const taxAmount = hasItems
      ? sumItems(items, 'tax')
      : dto.taxAmount != null
        ? round2(dto.taxAmount)
        : taxRate != null
          ? round2((amount * taxRate) / 100)
          : existing.taxAmount != null
            ? Number(existing.taxAmount)
            : 0;
    const actualCost = dto.actualCost ?? round2(amount + taxAmount - deposit);
    const updated = await this.prisma.expenseRecord.update({
      where: { id },
      data: {
        ...rest,
        recordDate: recordDate ? new Date(recordDate) : undefined,
        amount,
        taxAmount,
        deposit,
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
    // Re-sync the linked container deposit (create / update / remove) so editing
    // a cost line or job-tagged voucher never leaves a stale deposit behind.
    await this.reconcileJobDeposit(
      updated,
      deposit ?? 0,
      shippingLine,
      volume,
      userId,
    );
    return updated;
  }

  /**
   * Post an expense to Accounts Payable inside a transaction: DR each line's
   * expense account (grouped; falling back to the legacy header account) and
   * CR A/P for the total, then mark the record APPROVED + POSTED. Shared by
   * `approve()` and the first payment of a bill.
   */
  private async postExpenseToAp(
    tx: Prisma.TransactionClient,
    record: {
      id: string;
      amount: Prisma.Decimal;
      description: string;
      accountId: string | null;
      items: { accountId: string | null; amount: Prisma.Decimal }[];
    },
    userId: string,
    memo?: string,
  ) {
    const payableId = await this.journal.accountIdByCode(
      tx,
      ACCOUNT_CODES.ACCOUNTS_PAYABLE,
    );
    const amount = Number(record.amount);
    // Total debits = amount, so the entry stays balanced against the A/P credit.
    const byAccount = new Map<string, number>();
    for (const it of record.items) {
      const accountId = it.accountId ?? record.accountId;
      if (!accountId) {
        throw new UnprocessableEntityException(
          'Each expense line needs an expense account',
        );
      }
      byAccount.set(
        accountId,
        round2((byAccount.get(accountId) ?? 0) + Number(it.amount)),
      );
    }
    let debitLines: {
      accountId: string;
      entryType: EntryLineType;
      amount: number;
    }[];
    if (byAccount.size > 0) {
      debitLines = [...byAccount].map(([accountId, amt]) => ({
        accountId,
        entryType: EntryLineType.DEBIT,
        amount: amt,
      }));
    } else if (record.accountId) {
      debitLines = [
        { accountId: record.accountId, entryType: EntryLineType.DEBIT, amount },
      ];
    } else {
      throw new UnprocessableEntityException(
        'Expense has no expense account to debit',
      );
    }
    const entry = await this.journal.postJournal(tx, {
      entryDate: new Date(),
      description: `Expense: ${record.description}`,
      referenceType: ReferenceType.EXPENSE,
      referenceId: record.id,
      expenseRecordId: record.id,
      memo,
      createdBy: userId,
      lines: [
        ...debitLines,
        { accountId: payableId, entryType: EntryLineType.CREDIT, amount },
      ],
    });
    await tx.expenseRecord.update({
      where: { id: record.id },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedBy: userId,
        approvalDate: new Date(),
        status: TransactionStatus.POSTED,
        recordedDate: new Date(),
      },
    });
    return entry;
  }

  /** Approve (Manager/Admin): mark APPROVED + POSTED, DR expense / CR A/P. */
  async approve(id: string, userId: string, notes?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const record = await tx.expenseRecord.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!record) throw new NotFoundException('Expense record not found');
      if (record.approvalStatus === ApprovalStatus.APPROVED) {
        throw new UnprocessableEntityException('Expense is already approved');
      }
      const entry = await this.postExpenseToAp(tx, record, userId, notes);
      const updated = await tx.expenseRecord.findUniqueOrThrow({
        where: { id },
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

  /**
   * Record a payment against a bill inside a transaction. On the first payment
   * of a not-yet-posted bill it also posts the expense to A/P, so entering a
   * bill and clearing it needs no separate approval step. Header fields (date,
   * method, bank, reference, cheque) are shared; `amount` is per bill.
   */
  private async payBillTx(
    tx: Prisma.TransactionClient,
    id: string,
    header: {
      paymentDate: string;
      method: PayBillDto['method'];
      bankAccountId?: string;
      bankName?: string;
      accountNumber?: string;
      referenceNumber?: string;
      checkNumber?: string;
      notes?: string;
    },
    amount: number,
    userId: string,
  ) {
    const record = await tx.expenseRecord.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!record) throw new NotFoundException('Expense record not found');

    // Post the bill to A/P on its first payment if it hasn't been posted yet.
    if (record.status !== TransactionStatus.POSTED) {
      await this.postExpenseToAp(tx, record, userId);
    }

    const paidAgg = await tx.vendorPayment.aggregate({
      where: { expenseRecordId: id },
      _sum: { amount: true },
    });
    const balance = round2(
      Number(record.amount) - Number(paidAgg._sum.amount ?? 0),
    );
    if (amount > balance) {
      throw new UnprocessableEntityException(
        `Payment exceeds outstanding balance for ${record.recordNumber}`,
      );
    }

    const paymentNumber = await nextPaymentNumber(
      tx,
      new Date(header.paymentDate),
    );
    const payment = await tx.vendorPayment.create({
      data: {
        paymentNumber,
        paymentDate: new Date(header.paymentDate),
        supplierId: record.supplierId,
        supplierName: record.supplierName,
        clearanceJobId: record.clearanceJobId,
        expenseRecordId: id,
        amount,
        currency: record.currency,
        method: header.method,
        bankAccountId: header.bankAccountId,
        bankName: header.bankName,
        accountNumber: header.accountNumber,
        referenceNumber: header.referenceNumber,
        checkNumber: header.checkNumber,
        notes: header.notes,
        createdBy: userId,
      },
    });

    const apId = await this.journal.accountIdByCode(
      tx,
      ACCOUNT_CODES.ACCOUNTS_PAYABLE,
    );
    const bankId =
      header.bankAccountId ??
      (await this.journal.accountIdByCode(tx, ACCOUNT_CODES.BANK));
    await this.journal.postJournal(tx, {
      entryDate: new Date(header.paymentDate),
      description: `Bill payment ${payment.paymentNumber}`,
      referenceType: ReferenceType.PAYMENT,
      referenceId: payment.id,
      expenseRecordId: id,
      createdBy: userId,
      lines: [
        { accountId: apId, entryType: EntryLineType.DEBIT, amount },
        { accountId: bankId, entryType: EntryLineType.CREDIT, amount },
      ],
    });

    return payment;
  }

  /** Pay (part of) a single bill; posts it to A/P first if not yet posted. */
  async payBill(id: string, dto: PayBillDto, userId: string) {
    const payment = await this.prisma.$transaction((tx) =>
      this.payBillTx(tx, id, dto, dto.amount, userId),
    );
    await this.audit.log({
      userId,
      entityType: 'VendorPayment',
      entityId: payment.id,
      action: AuditAction.CREATE,
      after: {
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount),
        expenseRecordId: id,
      },
    });
    return payment;
  }

  /** Clear several bills at once (shared payment header), all in one transaction. */
  async payBills(dto: PayBillsDto, userId: string) {
    const payments = await this.prisma.$transaction((tx) =>
      dto.bills.reduce(
        async (prev, b) => {
          const acc = await prev;
          acc.push(await this.payBillTx(tx, b.id, dto, b.amount, userId));
          return acc;
        },
        Promise.resolve([] as { id: string; paymentNumber: string }[]),
      ),
    );
    await this.audit.log({
      userId,
      entityType: 'VendorPayment',
      entityId: payments.map((p) => p.id).join(','),
      action: AuditAction.CREATE,
      after: { count: payments.length },
    });
    return { count: payments.length };
  }

  /** Open payables: bills with an outstanding balance, for the Pay Bills screen. */
  async openPayables(query: ListExpensesDto) {
    const rows = await this.prisma.expenseRecord.findMany({
      where: this.buildWhere(query),
      include: {
        supplier: { select: { nameEn: true } },
        vendorPayments: { select: { amount: true } },
      },
      orderBy: [{ recordDate: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });
    return {
      data: rows
        .map((r) => {
          const { balanceDue } = paymentSummary(r.amount, r.vendorPayments);
          return {
            id: r.id,
            recordNumber: r.recordNumber,
            recordDate: r.recordDate,
            supplierName: r.supplierName ?? r.supplier?.nameEn ?? null,
            invoiceNumber: r.invoiceNumber,
            amount: Number(r.amount),
            balanceDue,
            currency: r.currency,
          };
        })
        .filter((r) => r.balanceDue > 0),
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

/** Sum a numeric field across items (tax/deposit are per-line; default 0). */
function sumItems(
  items: { tax?: number; deposit?: number }[] | undefined,
  key: 'tax' | 'deposit',
): number {
  return round2((items ?? []).reduce((s, i) => s + (i[key] ?? 0), 0));
}

/** Map an item DTO to a Prisma nested-create row. */
function toItemCreate(i: {
  itemNumber: number;
  acCode?: string;
  accountId?: string;
  itemDate?: string;
  invoiceNumber?: string;
  description: string;
  amount: number;
  tax?: number;
  deposit?: number;
}): Prisma.ExpenseItemCreateWithoutExpenseRecordInput {
  return {
    itemNumber: i.itemNumber,
    acCode: i.acCode,
    account: i.accountId ? { connect: { id: i.accountId } } : undefined,
    itemDate: i.itemDate ? new Date(i.itemDate) : undefined,
    invoiceNumber: i.invoiceNumber,
    description: i.description,
    amount: i.amount,
    tax: i.tax ?? null,
    deposit: i.deposit ?? null,
  };
}

/** Outstanding-balance summary for a bill from its payments. */
function paymentSummary(
  amount: Prisma.Decimal | number,
  payments: { amount: Prisma.Decimal | number }[],
): { amountPaid: number; balanceDue: number; paymentStatus: string } {
  const total = round2(Number(amount));
  const amountPaid = round2(payments.reduce((s, p) => s + Number(p.amount), 0));
  const balanceDue = round2(total - amountPaid);
  const paymentStatus =
    amountPaid <= 0 ? 'UNPAID' : balanceDue <= 0 ? 'PAID' : 'PARTIAL';
  return { amountPaid, balanceDue, paymentStatus };
}

async function nextPaymentNumber(
  tx: Prisma.TransactionClient,
  date: Date,
): Promise<string> {
  const year = date.getUTCFullYear();
  const count = await tx.vendorPayment.count({
    where: { paymentNumber: { startsWith: `VPAY-${year}-` } },
  });
  return `VPAY-${year}-${String(count + 1).padStart(4, '0')}`;
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
