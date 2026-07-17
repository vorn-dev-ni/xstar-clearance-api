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
  ) {}

  async create(dto: CreateInvoiceDto, userId: string) {
    // A debit note is "not under company title" and carries no VAT.
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
        orderBy: { invoiceDate: 'desc' },
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
      include: { lineItems: true, payments: true, customer: true },
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

      const entry = await this.journal.postJournal(tx, {
        entryDate: new Date(),
        description: `Invoice ${invoice.invoiceNumber}`,
        referenceType: ReferenceType.INVOICE,
        referenceId: invoice.id,
        invoiceId: invoice.id,
        createdBy: userId,
        lines,
      });

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
