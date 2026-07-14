import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { ListSuppliersDto } from './dto/list-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSupplierDto) {
    try {
      return await this.prisma.supplier.create({ data: dto });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async findAll(query: ListSuppliersDto) {
    const where: Prisma.SupplierWhereInput = {
      isActive: query.isActive,
      ...(query.search
        ? {
            OR: [
              { nameEn: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { taxId: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOne(id);
    try {
      return await this.prisma.supplier.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  private mapUniqueError(e: unknown): unknown {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException(
        'A supplier with this code or tax ID already exists',
      );
    }
    return e;
  }
}
