import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { monthYearRange } from '../common/date-range';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBankReconciliationDto } from './dto/create-bank-reconciliation.dto';
import { ListBankReconciliationsDto } from './dto/list-bank-reconciliations.dto';
import { UpdateBankReconciliationDto } from './dto/update-bank-reconciliation.dto';

const bankAccountSelect = {
  select: { id: true, nameEn: true, accountNumber: true, bankName: true },
} as const;

@Injectable()
export class BankReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  private lineRows(lines: CreateBankReconciliationDto['lines']) {
    return lines.map((l, i) => ({
      itemNumber: l.itemNumber ?? i + 1,
      description: l.description,
      moneyIn: l.moneyIn ?? 0,
      moneyOut: l.moneyOut ?? 0,
      remark: l.remark,
    }));
  }

  async create(dto: CreateBankReconciliationDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const statementNumber = await nextNumber(tx, new Date(dto.periodStart));
      return tx.bankReconciliation.create({
        data: {
          statementNumber,
          bankAccountId: dto.bankAccountId,
          periodStart: new Date(dto.periodStart),
          periodEnd: new Date(dto.periodEnd),
          openingBalance: dto.openingBalance,
          notes: dto.notes,
          createdBy: userId,
          lines: { create: this.lineRows(dto.lines) },
        },
        select: { id: true, statementNumber: true, createdAt: true },
      });
    });
  }

  private buildWhere(
    query: ListBankReconciliationsDto,
  ): Prisma.BankReconciliationWhereInput {
    const periodStart =
      query.dateFrom || query.dateTo
        ? {
            gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
            lte: query.dateTo ? new Date(query.dateTo) : undefined,
          }
        : monthYearRange(query.month, query.year);
    return {
      bankAccountId: query.bankAccountId,
      periodStart,
      statementNumber: query.search
        ? { contains: query.search, mode: 'insensitive' }
        : undefined,
    };
  }

  async findAll(query: ListBankReconciliationsDto) {
    const where = this.buildWhere(query);
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.bankReconciliation.findMany({
        where,
        include: {
          bankAccount: bankAccountSelect,
          lines: { select: { moneyIn: true, moneyOut: true } },
        },
        orderBy: { periodStart: 'desc' },
        skip,
        take,
      }),
      this.prisma.bankReconciliation.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        statementNumber: r.statementNumber,
        bankAccount: r.bankAccount,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        openingBalance: Number(r.openingBalance),
        endingBalance: endingBalance(r.openingBalance, r.lines),
        lineCount: r.lines.length,
      })),
      pagination: paginationMeta(total, query.page, query.limit),
    };
  }

  async findOne(id: string) {
    const record = await this.prisma.bankReconciliation.findUnique({
      where: { id },
      include: {
        bankAccount: bankAccountSelect,
        lines: { orderBy: { itemNumber: 'asc' } },
      },
    });
    if (!record) throw new NotFoundException('Bank reconciliation not found');
    return record;
  }

  async update(id: string, dto: UpdateBankReconciliationDto) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      return tx.bankReconciliation.update({
        where: { id },
        data: {
          bankAccountId: dto.bankAccountId,
          periodStart: dto.periodStart ? new Date(dto.periodStart) : undefined,
          periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : undefined,
          openingBalance: dto.openingBalance,
          notes: dto.notes,
          // Replace the whole line set when provided.
          ...(dto.lines
            ? { lines: { deleteMany: {}, create: this.lineRows(dto.lines) } }
            : {}),
        },
        select: { id: true, statementNumber: true, updatedAt: true },
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.bankReconciliation.delete({ where: { id } });
    return { id };
  }
}

function endingBalance(
  opening: Prisma.Decimal,
  lines: { moneyIn: Prisma.Decimal; moneyOut: Prisma.Decimal }[],
): number {
  const totals = lines.reduce(
    (acc, l) => ({
      in: acc.in + Number(l.moneyIn),
      out: acc.out + Number(l.moneyOut),
    }),
    { in: 0, out: 0 },
  );
  return Math.round((Number(opening) + totals.in - totals.out) * 100) / 100;
}

async function nextNumber(
  tx: Prisma.TransactionClient,
  date: Date,
): Promise<string> {
  const year = date.getUTCFullYear();
  const count = await tx.bankReconciliation.count({
    where: { statementNumber: { startsWith: `BR-${year}-` } },
  });
  return `BR-${year}-${String(count + 1).padStart(4, '0')}`;
}
