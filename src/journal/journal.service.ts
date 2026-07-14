import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  EntryLineType,
  EntryStatus,
  Prisma,
  ReferenceType,
} from '@prisma/client';
import { balanceDelta } from '../common/accounting.constants';
import { monthYearRange } from '../common/date-range';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { ListJournalEntriesDto } from './dto/list-journal-entries.dto';

export interface PostJournalLine {
  accountId: string;
  entryType: EntryLineType;
  amount: number;
  description?: string;
}

export interface PostJournalParams {
  entryDate: Date;
  description: string;
  referenceType: ReferenceType;
  referenceId?: string;
  incomeRecordId?: string;
  expenseRecordId?: string;
  invoiceId?: string;
  memo?: string;
  createdBy: string;
  lines: PostJournalLine[];
  status?: EntryStatus;
}

const BALANCE_TOLERANCE = 0.001;

@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Posts a balanced journal entry inside an existing transaction, moving each
   * account's balance in its natural direction. Reused by income/expense/invoice
   * approval so all double-entry logic lives here.
   */
  async postJournal(tx: Prisma.TransactionClient, params: PostJournalParams) {
    const debit = sum(params.lines, EntryLineType.DEBIT);
    const credit = sum(params.lines, EntryLineType.CREDIT);
    if (Math.abs(debit - credit) > BALANCE_TOLERANCE) {
      throw new UnprocessableEntityException(
        `Journal entry is unbalanced: debits ${debit.toFixed(2)} != credits ${credit.toFixed(2)}`,
      );
    }

    const entryNumber = await this.nextEntryNumber(tx, params.entryDate);

    const entry = await tx.journalEntry.create({
      data: {
        entryNumber,
        entryDate: params.entryDate,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        incomeRecordId: params.incomeRecordId,
        expenseRecordId: params.expenseRecordId,
        invoiceId: params.invoiceId,
        description: params.description,
        memo: params.memo,
        status: params.status ?? EntryStatus.POSTED,
        createdBy: params.createdBy,
        lines: {
          create: params.lines.map((l) => ({
            accountId: l.accountId,
            entryType: l.entryType,
            amount: l.amount,
            description: l.description,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });

    // Move account balances (only for POSTED entries).
    if (entry.status === EntryStatus.POSTED) {
      const accounts = await tx.account.findMany({
        where: { id: { in: params.lines.map((l) => l.accountId) } },
        select: { id: true, type: true },
      });
      const typeById = new Map(accounts.map((a) => [a.id, a.type]));
      for (const line of params.lines) {
        const type = typeById.get(line.accountId);
        if (!type) continue;
        const delta = balanceDelta(type, line.entryType, line.amount);
        await tx.account.update({
          where: { id: line.accountId },
          data: { balance: { increment: delta } },
        });
      }
    }

    return entry;
  }

  /** Resolve a well-known account id by its chart code (e.g. bank `1100`). */
  async accountIdByCode(
    tx: Prisma.TransactionClient,
    code: string,
  ): Promise<string> {
    const account = await tx.account.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!account) {
      throw new UnprocessableEntityException(
        `Required account ${code} is not configured in the chart of accounts`,
      );
    }
    return account.id;
  }

  async createEntry(dto: CreateJournalEntryDto, userId: string) {
    return this.prisma.$transaction((tx) =>
      this.postJournal(tx, {
        entryDate: new Date(dto.entryDate),
        description: dto.description,
        referenceType: dto.referenceType ?? ReferenceType.MANUAL_ENTRY,
        memo: dto.memo,
        createdBy: userId,
        lines: dto.lines,
      }),
    );
  }

  async findAll(query: ListJournalEntriesDto) {
    const where: Prisma.JournalEntryWhereInput = {
      status: query.status,
      entryDate: monthYearRange(query.month, query.year),
    };
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        include: { lines: { include: { account: true } } },
        orderBy: { entryDate: 'desc' },
        skip,
        take,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    const data = rows.map((e) => ({
      id: e.id,
      entryNumber: e.entryNumber,
      entryDate: e.entryDate,
      description: e.description,
      status: e.status,
      totalDebit: sumLines(e.lines, EntryLineType.DEBIT),
      totalCredit: sumLines(e.lines, EntryLineType.CREDIT),
      lines: e.lines.map((l) => ({
        account: l.account.nameEn,
        entryType: l.entryType,
        amount: Number(l.amount),
      })),
    }));

    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }

  private async nextEntryNumber(
    tx: Prisma.TransactionClient,
    date: Date,
  ): Promise<string> {
    const year = date.getUTCFullYear();
    const count = await tx.journalEntry.count({
      where: { entryNumber: { startsWith: `JE-${year}-` } },
    });
    return `JE-${year}-${String(count + 1).padStart(4, '0')}`;
  }
}

function sum(lines: PostJournalLine[], type: EntryLineType): number {
  return lines
    .filter((l) => l.entryType === type)
    .reduce((acc, l) => acc + l.amount, 0);
}

function sumLines(
  lines: { entryType: EntryLineType; amount: Prisma.Decimal }[],
  type: EntryLineType,
): number {
  return lines
    .filter((l) => l.entryType === type)
    .reduce((acc, l) => acc + Number(l.amount), 0);
}
