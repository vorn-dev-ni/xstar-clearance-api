import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  EntryLineType,
  Prisma,
  ReferenceType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ACCOUNT_CODES } from '../common/accounting.constants';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { JournalService } from '../journal/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorPaymentDto } from './dto/create-vendor-payment.dto';
import { ListVendorPaymentsDto } from './dto/list-vendor-payments.dto';

@Injectable()
export class VendorPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
  ) {}

  /** Pay a vendor and post DR Accounts Payable / CR Bank (clears the payable). */
  async create(dto: CreateVendorPaymentDto, userId: string) {
    const payment = await this.prisma.$transaction(async (tx) => {
      const paymentNumber = await nextPaymentNumber(
        tx,
        new Date(dto.paymentDate),
      );
      const payment = await tx.vendorPayment.create({
        data: {
          paymentNumber,
          paymentDate: new Date(dto.paymentDate),
          supplierId: dto.supplierId,
          supplierName: dto.supplierName,
          clearanceJobId: dto.clearanceJobId,
          expenseRecordId: dto.expenseRecordId,
          amount: dto.amount,
          currency: dto.currency,
          method: dto.method,
          bankAccountId: dto.bankAccountId,
          bankName: dto.bankName,
          accountNumber: dto.accountNumber,
          referenceNumber: dto.referenceNumber,
          checkNumber: dto.checkNumber,
          notes: dto.notes,
          createdBy: userId,
        },
      });

      const apId = await this.journal.accountIdByCode(
        tx,
        ACCOUNT_CODES.ACCOUNTS_PAYABLE,
      );
      const bankId =
        dto.bankAccountId ??
        (await this.journal.accountIdByCode(tx, ACCOUNT_CODES.BANK));
      await this.journal.postJournal(tx, {
        entryDate: new Date(dto.paymentDate),
        description: `Vendor payment ${payment.paymentNumber}${
          dto.supplierName ? ` to ${dto.supplierName}` : ''
        }`,
        referenceType: ReferenceType.PAYMENT,
        referenceId: payment.id,
        expenseRecordId: dto.expenseRecordId,
        createdBy: userId,
        lines: [
          {
            accountId: apId,
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

      return payment;
    });
    await this.audit.log({
      userId,
      entityType: 'VendorPayment',
      entityId: payment.id,
      action: AuditAction.CREATE,
      after: {
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount),
      },
    });
    return payment;
  }

  async findAll(query: ListVendorPaymentsDto) {
    const paymentDate =
      query.dateFrom || query.dateTo
        ? {
            gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
            lte: query.dateTo ? new Date(query.dateTo) : undefined,
          }
        : undefined;
    const where: Prisma.VendorPaymentWhereInput = {
      supplierId: query.supplierId,
      clearanceJobId: query.clearanceJobId,
      method: query.method,
      paymentDate,
      ...(query.search
        ? {
            OR: [
              {
                paymentNumber: { contains: query.search, mode: 'insensitive' },
              },
              { supplierName: { contains: query.search, mode: 'insensitive' } },
              {
                supplier: {
                  nameEn: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.vendorPayment.findMany({
        where,
        include: { supplier: { select: { nameEn: true } } },
        orderBy: { paymentDate: 'desc' },
        skip,
        take,
      }),
      this.prisma.vendorPayment.count({ where }),
    ]);
    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }
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
