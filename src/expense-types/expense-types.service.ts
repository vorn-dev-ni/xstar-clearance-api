import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { CreateExpenseTypeDto } from './dto/create-expense-type.dto';
import { UpdateExpenseTypeDto } from './dto/update-expense-type.dto';
import { ListExpenseTypesDto } from './dto/list-expense-types.dto';

/** UPPER_SNAKE code derived from a display name, e.g. "Car Rental" → "CAR_RENTAL". */
function slugCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

@Injectable()
export class ExpenseTypesService {
  constructor(private readonly prisma: PrismaService) {}

  private async uniqueCode(base: string): Promise<string> {
    const code = base || 'TYPE';
    let candidate = code;
    let n = 1;
    while (
      await this.prisma.expenseType.findUnique({ where: { code: candidate } })
    ) {
      candidate = `${code}_${++n}`;
    }
    return candidate;
  }

  async create(dto: CreateExpenseTypeDto) {
    const code = await this.uniqueCode(dto.code?.trim() || slugCode(dto.name));
    return this.prisma.expenseType.create({
      data: {
        code,
        name: dto.name,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async findAll(query: ListExpenseTypesDto) {
    const where: Prisma.ExpenseTypeWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expenseType.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.expenseType.count({ where }),
    ]);
    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }

  async findOne(id: string) {
    const type = await this.prisma.expenseType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException('Expense type not found');
    return type;
  }

  async update(id: string, dto: UpdateExpenseTypeDto) {
    await this.findOne(id);
    // `code` is immutable once created (records reference it); ignore any incoming code.
    return this.prisma.expenseType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async remove(id: string) {
    const type = await this.findOne(id);
    const inUse = await this.prisma.expenseRecord.count({
      where: { expenseType: type.code },
    });
    if (inUse > 0) {
      throw new ConflictException(
        'This expense type is used by expense records and cannot be deleted; deactivate it instead.',
      );
    }
    await this.prisma.expenseType.delete({ where: { id } });
    return { id };
  }
}
