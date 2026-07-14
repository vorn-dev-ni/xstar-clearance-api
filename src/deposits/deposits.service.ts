import { Injectable } from '@nestjs/common';
import { EntryLineType, Prisma, ReferenceType } from '@prisma/client';
import { ACCOUNT_CODES } from '../common/accounting.constants';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JournalService } from '../journal/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepositDto } from './dto/create-deposit.dto';

@Injectable()
export class DepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
  ) {}

  /** Create a deposit and post DR deposit account / CR bank. */
  async create(dto: CreateDepositDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
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
          amount: dto.amount,
          currency: dto.currency,
          purpose: dto.purpose,
          accountId: dto.accountId,
          notes: dto.notes,
          createdBy: userId,
        },
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
  }

  async findAll(query: PaginationQueryDto) {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.deposit.findMany({
        orderBy: { depositDate: 'desc' },
        skip,
        take,
      }),
      this.prisma.deposit.count(),
    ]);
    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }
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
