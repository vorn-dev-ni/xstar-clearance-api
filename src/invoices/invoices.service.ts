import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AuditAction,
  EntryLineType,
  InvoiceStatus,
  InvoiceType,
  Prisma,
  ReferenceType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ACCOUNT_CODES } from '../common/accounting.constants';
import { IncomeService } from '../income/income.service';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { JournalService } from '../journal/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

const round2 = (n: number): number => Math.round(n * 100) / 100;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
    private readonly income: IncomeService,
  ) {}

  /**
   * Derive line amounts and invoice totals from the input. A debit note is "not
   * under company title" and carries no VAT. Shared by create and update.
   */
  private computeTotals(dto: CreateInvoiceDto) {
    const invoiceType = dto.invoiceType ?? InvoiceType.TAX_INVOICE;
    const isDebitNote = invoiceType === InvoiceType.DEBIT_NOTE;
    const taxRate = isDebitNote ? 0 : (dto.taxRate ?? 10);
    const lines = dto.lineItems.map((li) => ({
      ...li,
      taxable: li.taxable ?? true,
      amount: round2(li.quantity * li.unitPrice),
    }));
    const subtotal = round2(lines.reduce((acc, l) => acc + l.amount, 0));
    const taxableBase = round2(
      lines.filter((l) => l.taxable).reduce((acc, l) => acc + l.amount, 0),
    );
    const taxAmount = isDebitNote ? 0 : round2((taxableBase * taxRate) / 100);
    const totalAmount = round2(subtotal + taxAmount);
    return {
      invoiceType,
      isDebitNote,
      taxRate,
      lines,
      subtotal,
      taxAmount,
      totalAmount,
    };
  }

  /** Post an issued invoice to the ledger: DR A/R, CR revenue, CR VAT payable. */
  private async postInvoiceJournal(
    tx: Prisma.TransactionClient,
    invoice: {
      id: string;
      invoiceNumber: string;
      subtotal: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
    },
    userId: string,
  ) {
    const arId = await this.journal.accountIdByCode(
      tx,
      ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
    );
    const revenueId = await this.journal.accountIdByCode(
      tx,
      ACCOUNT_CODES.OPERATION_REVENUE,
    );
    const vatId = await this.journal.accountIdByCode(
      tx,
      ACCOUNT_CODES.VAT_PAYABLE,
    );
    const subtotal = Number(invoice.subtotal);
    const taxAmount = Number(invoice.taxAmount);
    const total = Number(invoice.totalAmount);
    const lines = [
      { accountId: arId, entryType: EntryLineType.DEBIT, amount: total },
      {
        accountId: revenueId,
        entryType: EntryLineType.CREDIT,
        amount: subtotal,
      },
    ];
    if (taxAmount > 0) {
      lines.push({
        accountId: vatId,
        entryType: EntryLineType.CREDIT,
        amount: taxAmount,
      });
    }
    return this.journal.postJournal(tx, {
      entryDate: new Date(),
      description: `Invoice ${invoice.invoiceNumber}`,
      referenceType: ReferenceType.INVOICE,
      referenceId: invoice.id,
      invoiceId: invoice.id,
      createdBy: userId,
      lines,
    });
  }

  async create(dto: CreateInvoiceDto, userId: string) {
    const {
      invoiceType,
      isDebitNote,
      taxRate,
      lines,
      subtotal,
      taxAmount,
      totalAmount,
    } = this.computeTotals(dto);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(
        tx,
        new Date(dto.invoiceDate),
      );
      return tx.invoice.create({
        data: {
          invoiceNumber,
          invoiceDate: new Date(dto.invoiceDate),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          customerId: dto.customerId,
          clearanceJobId: dto.clearanceJobId,
          invoiceType,
          underCompanyTitle: !isDebitNote,
          subtotal,
          taxRate,
          taxAmount,
          totalAmount,
          balanceDue: totalAmount,
          deposit: dto.deposit ?? 0,
          currency: dto.currency,
          description: dto.description,
          notes: dto.notes,
          issuedBy: userId,
          lineItems: {
            create: lines.map((l) => ({
              itemNumber: l.itemNumber,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              amount: l.amount,
              taxable: l.taxable,
              notes: l.notes,
            })),
          },
        },
      });
    });

    await this.audit.log({
      userId,
      entityType: 'Invoice',
      entityId: invoice.id,
      action: AuditAction.CREATE,
      after: { totalAmount: Number(invoice.totalAmount) },
    });

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      customerId: invoice.customerId,
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.taxAmount),
      totalAmount: Number(invoice.totalAmount),
      status: invoice.status,
      createdAt: invoice.createdAt,
    };
  }

  private buildWhere(query: ListInvoicesDto): Prisma.InvoiceWhereInput {
    const invoiceDate =
      query.dateFrom || query.dateTo
        ? {
            gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
            lte: query.dateTo ? new Date(query.dateTo) : undefined,
          }
        : undefined;
    return {
      status: query.status,
      invoiceType: query.invoiceType,
      customerId: query.customerId,
      clearanceJobId: query.clearanceJobId,
      invoiceNumber: query.search
        ? { contains: query.search, mode: 'insensitive' }
        : undefined,
      invoiceDate,
    };
  }

  async findAll(query: ListInvoicesDto) {
    const where = this.buildWhere(query);
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total, agg] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: { customer: { select: { nameEn: true } } },
        orderBy: [{ createdAt: 'desc' }, { invoiceDate: 'desc' }],
        skip,
        take,
      }),
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.aggregate({
        where,
        _sum: { totalAmount: true, paidAmount: true, balanceDue: true },
      }),
    ]);
    return {
      data: rows,
      pagination: paginationMeta(total, query.page, query.limit),
      summary: {
        totalInvoiced: Number(agg._sum.totalAmount ?? 0),
        totalPaid: Number(agg._sum.paidAmount ?? 0),
        totalDue: Number(agg._sum.balanceDue ?? 0),
      },
    };
  }

  /** Unpaginated fetch for exports (capped at 1000 most recent). */
  async findAllForExport(query: ListInvoicesDto) {
    const where = this.buildWhere(query);
    const [rows, agg] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: { customer: { select: { nameEn: true } } },
        orderBy: { invoiceDate: 'desc' },
        take: 1000,
      }),
      this.prisma.invoice.aggregate({
        where,
        _sum: { totalAmount: true, paidAmount: true, balanceDue: true },
      }),
    ]);
    return {
      rows,
      summary: {
        totalInvoiced: Number(agg._sum.totalAmount ?? 0),
        totalPaid: Number(agg._sum.paidAmount ?? 0),
        totalDue: Number(agg._sum.balanceDue ?? 0),
      },
    };
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        lineItems: true,
        payments: true,
        customer: true,
        incomeRecord: { select: { id: true, recordNumber: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  /** Finalize (ISSUE): DR A/R, CR revenue + CR VAT payable. */
  async finalize(id: string, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id } });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new UnprocessableEntityException(
          `Only DRAFT invoices can be issued (current: ${invoice.status})`,
        );
      }

      const entry = await this.postInvoiceJournal(tx, invoice, userId);

      const updated = await tx.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.ISSUED },
      });
      return { updated, entry };
    });

    await this.audit.log({
      userId,
      entityType: 'Invoice',
      entityId: id,
      action: AuditAction.POST,
      after: { status: InvoiceStatus.ISSUED },
    });

    return {
      id: result.updated.id,
      invoiceNumber: result.updated.invoiceNumber,
      status: result.updated.status,
      journalEntryId: result.entry.id,
      issuedAt: result.updated.updatedAt,
    };
  }

  /**
   * Edit an invoice — allowed for DRAFT, ISSUED and SENT (paid/partially-paid etc.
   * are out of scope). DRAFT is a plain update. ISSUED/SENT have a posted
   * A/R+revenue+VAT entry and no payments, so it's reversed and re-posted with the
   * new amounts; balanceDue tracks the new total.
   */
  async update(id: string, dto: CreateInvoiceDto, userId: string) {
    const existing = await this.findOne(id);
    const editableStatuses: InvoiceStatus[] = [
      InvoiceStatus.DRAFT,
      InvoiceStatus.ISSUED,
      InvoiceStatus.SENT,
    ];
    if (!editableStatuses.includes(existing.status)) {
      throw new UnprocessableEntityException(
        `Only draft, issued or sent invoices can be edited (current: ${existing.status})`,
      );
    }
    // Anything past DRAFT already posted to the ledger and must be re-posted.
    const wasPosted = existing.status !== InvoiceStatus.DRAFT;
    const {
      invoiceType,
      isDebitNote,
      taxRate,
      lines,
      subtotal,
      taxAmount,
      totalAmount,
    } = this.computeTotals(dto);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (wasPosted) {
        await this.journal.reverseEntriesByReference(
          tx,
          ReferenceType.INVOICE,
          id,
        );
      }
      const invoice = await tx.invoice.update({
        where: { id },
        data: {
          invoiceDate: new Date(dto.invoiceDate),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          customerId: dto.customerId,
          clearanceJobId: dto.clearanceJobId ?? null,
          invoiceType,
          underCompanyTitle: !isDebitNote,
          subtotal,
          taxRate,
          taxAmount,
          totalAmount,
          balanceDue: totalAmount,
          deposit: dto.deposit ?? existing.deposit,
          currency: dto.currency,
          description: dto.description,
          notes: dto.notes,
          lineItems: {
            deleteMany: {},
            create: lines.map((l) => ({
              itemNumber: l.itemNumber,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              amount: l.amount,
              taxable: l.taxable,
              notes: l.notes,
            })),
          },
        },
      });
      if (wasPosted) {
        await this.postInvoiceJournal(tx, invoice, userId);
      }
      return invoice;
    });

    await this.audit.log({
      userId,
      entityType: 'Invoice',
      entityId: id,
      action: AuditAction.UPDATE,
      before: { totalAmount: Number(existing.totalAmount) },
      after: { totalAmount: Number(updated.totalAmount) },
    });

    return {
      id: updated.id,
      invoiceNumber: updated.invoiceNumber,
      status: updated.status,
      totalAmount: Number(updated.totalAmount),
    };
  }

  /** Record a payment: update balances/status and post DR bank / CR A/R. */
  async recordPayment(id: string, dto: RecordPaymentDto, userId: string) {
    const payment = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id } });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (
        invoice.status === InvoiceStatus.DRAFT ||
        invoice.status === InvoiceStatus.CANCELLED
      ) {
        throw new UnprocessableEntityException(
          `Cannot record a payment on a ${invoice.status} invoice`,
        );
      }

      const balanceDue = Number(invoice.balanceDue);
      if (dto.amount > balanceDue + 0.001) {
        throw new UnprocessableEntityException(
          `Payment ${dto.amount.toFixed(2)} exceeds balance due ${balanceDue.toFixed(2)}`,
        );
      }

      const paymentNumber = await nextPaymentNumber(
        tx,
        new Date(dto.paymentDate),
      );
      const created = await tx.payment.create({
        data: {
          paymentNumber,
          paymentDate: new Date(dto.paymentDate),
          invoiceId: id,
          amount: dto.amount,
          currency: invoice.currency,
          method: dto.method,
          bankAccountId: dto.bankAccountId,
          bankName: dto.bankName,
          accountNumber: dto.accountNumber,
          referenceNumber: dto.referenceNumber,
          checkNumber: dto.checkNumber,
          notes: dto.notes,
        },
      });

      const newPaid = round2(Number(invoice.paidAmount) + dto.amount);
      const newBalance = round2(Number(invoice.totalAmount) - newPaid);
      const status =
        newBalance <= 0.001 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

      await tx.invoice.update({
        where: { id },
        data: { paidAmount: newPaid, balanceDue: newBalance, status },
      });

      // Once fully paid, surface this invoice in the income/revenue register via a
      // reporting-only income row (no extra journal post — see IncomeService). Idempotent.
      if (status === InvoiceStatus.PAID) {
        await this.income.createFromInvoiceTx(
          tx,
          invoice,
          new Date(dto.paymentDate),
          userId,
        );
      }

      const bankId =
        dto.bankAccountId ??
        (await this.journal.accountIdByCode(tx, ACCOUNT_CODES.BANK));
      const arId = await this.journal.accountIdByCode(
        tx,
        ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
      );
      await this.journal.postJournal(tx, {
        entryDate: new Date(dto.paymentDate),
        description: `Payment ${created.paymentNumber} for ${invoice.invoiceNumber}`,
        referenceType: ReferenceType.PAYMENT,
        referenceId: created.id,
        invoiceId: id,
        createdBy: userId,
        lines: [
          {
            accountId: bankId,
            entryType: EntryLineType.DEBIT,
            amount: dto.amount,
          },
          {
            accountId: arId,
            entryType: EntryLineType.CREDIT,
            amount: dto.amount,
          },
        ],
      });

      return created;
    });

    return {
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      invoiceId: id,
      amount: Number(payment.amount),
      status: payment.status,
      createdAt: payment.createdAt,
    };
  }
}

async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  date: Date,
): Promise<string> {
  const year = date.getUTCFullYear();
  const yy = String(year).slice(-2);
  const count = await tx.invoice.count({
    where: { invoiceNumber: { startsWith: `ST${yy}-` } },
  });
  return `ST${yy}-${String(count + 1).padStart(6, '0')}`;
}

async function nextPaymentNumber(
  tx: Prisma.TransactionClient,
  date: Date,
): Promise<string> {
  const year = date.getUTCFullYear();
  const count = await tx.payment.count({
    where: { paymentNumber: { startsWith: `PMT-${year}-` } },
  });
  return `PMT-${year}-${String(count + 1).padStart(4, '0')}`;
}
