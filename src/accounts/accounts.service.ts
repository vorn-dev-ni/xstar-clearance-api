import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { ListAccountsDto } from './dto/list-accounts.dto';
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
}
