import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ContainerDepositStatus,
  EntryLineType,
  Prisma,
  ReferenceType,
} from '@prisma/client';
import { ACCOUNT_CODES } from '../common/accounting.constants';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { JournalService } from '../journal/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepositDto } from './dto/create-deposit.dto';

const depositInclude = {
  customer: { select: { nameEn: true } },
  supplier: { select: { nameEn: true } },
  account: { select: { code: true, nameEn: true } },
  clearanceJob: { select: { jobNumber: true } },
} satisfies Prisma.DepositInclude;

@Injectable()
export class DepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
  ) {}

  /** Create a container deposit and post DR deposit account / CR bank. */
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
          clearanceJobId: dto.clearanceJobId,
          amount: dto.amount,
          currency: dto.currency,
          purpose: dto.purpose,
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
  }

  async findAll(query: PaginationQueryDto) {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.deposit.findMany({
        include: depositInclude,
        orderBy: { depositDate: 'desc' },
        skip,
        take,
      }),
      this.prisma.deposit.count(),
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
  ) {
    return this.prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.findUnique({ where: { id } });
      if (!deposit) throw new NotFoundException('Deposit not found');

      const becomingRefunded =
        status === ContainerDepositStatus.DEPOSIT_REFUNDED &&
        deposit.status !== ContainerDepositStatus.DEPOSIT_REFUNDED;

      const updated = await tx.deposit.update({
        where: { id },
        data: {
          status,
          releasedDate: becomingRefunded ? new Date() : deposit.releasedDate,
        },
        include: depositInclude,
      });

      if (becomingRefunded) {
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
