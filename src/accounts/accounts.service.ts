import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { balanceDelta } from '../common/accounting.constants';
import { monthYearRange } from '../common/date-range';
import { CreateAccountDto } from './dto/create-account.dto';
import { ListAccountsDto } from './dto/list-accounts.dto';
import { ListLedgerDto } from './dto/list-ledger.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { paginationMeta, toSkipTake } from '../common/pagination';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAccountDto) {
    try {
      return await this.prisma.account.create({ data: dto });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('An account with this code already exists');
      }
      throw e;
    }
  }

  async findAll(query: ListAccountsDto) {
    const { page, limit, type } = query;
    const { skip, take } = toSkipTake(page, limit);

    const [data, total] = await Promise.all([
      this.prisma.account.findMany({
        where: { type },
        orderBy: { code: 'asc' },
        skip,
        take,
      }),
      this.prisma.account.count({ where: { type } }),
    ]);

    return { data, pagination: paginationMeta(total, page, limit) };
  }

  async findOne(id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  /**
   * Edit account fields. `balance` is never client-set. Changing `type` flips the
   * natural balance sign, so the stored balance is recomputed from the account's
   * posted journal lines under the new type — keeping it consistent with what the
   * ledger drill-down (`ledger`) shows.
   */
  async update(id: string, dto: UpdateAccountDto) {
    const existing = await this.findOne(id);
    const typeChanged = dto.type != null && dto.type !== existing.type;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const account = await tx.account.update({ where: { id }, data: dto });
        if (!typeChanged) return account;

        const lines = await tx.journalEntryLine.findMany({
          where: { accountId: id, entry: { status: EntryStatus.POSTED } },
          select: { entryType: true, amount: true },
        });
        const balance = lines.reduce(
          (sum, l) =>
            sum + balanceDelta(account.type, l.entryType, Number(l.amount)),
          0,
        );
        return tx.account.update({ where: { id }, data: { balance } });
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('An account with this code already exists');
      }
      throw e;
    }
  }

  /**
   * The account's ledger: every posted journal line that touched it, with a
   * running balance so the caller can trace exactly how the stored balance was
   * built up. Lines are folded in chronological order (oldest first) via
   * `balanceDelta` — the natural-sign direction the posting engine uses — then
   * returned newest-first and paginated.
   */
  async ledger(id: string, query: ListLedgerDto) {
    const account = await this.findOne(id);
    const { page, limit } = query;

    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        accountId: id,
        entry: {
          status: EntryStatus.POSTED,
          entryDate: monthYearRange(query.month, query.year),
        },
      },
      include: { entry: true },
      orderBy: [
        { entry: { entryDate: 'asc' } },
        { entry: { entryNumber: 'asc' } },
        { id: 'asc' },
      ],
    });

    let running = 0;
    const chronological = lines.map((l) => {
      const amount = Number(l.amount);
      const delta = balanceDelta(account.type, l.entryType, amount);
      running += delta;
      return {
        id: l.id,
        entryId: l.entryId,
        entryNumber: l.entry.entryNumber,
        entryDate: l.entry.entryDate,
        description: l.description ?? l.entry.description,
        referenceType: l.entry.referenceType,
        referenceId: l.entry.referenceId,
        entryType: l.entryType,
        amount,
        delta,
        runningBalance: running,
      };
    });

    const total = chronological.length;
    const { skip, take } = toSkipTake(page, limit);
    const data = chronological.reverse().slice(skip, skip + take);

    return {
      account: {
        id: account.id,
        code: account.code,
        nameEn: account.nameEn,
        type: account.type,
        currency: account.currency,
        balance: account.balance,
      },
      data,
      pagination: paginationMeta(total, page, limit),
    };
  }
}
