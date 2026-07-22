import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { ListSuppliersDto } from './dto/list-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateSupplierDto, userId: string) {
    const code =
      dto.code ||
      `SUP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    try {
      const supplier = await this.prisma.supplier.create({
        data: { ...dto, code },
      });
      await this.audit.log({
        userId,
        entityType: 'Supplier',
        entityId: supplier.id,
        action: AuditAction.CREATE,
        after: supplier,
      });
      return supplier;
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

  async update(id: string, dto: UpdateSupplierDto, userId: string) {
    const existing = await this.findOne(id);
    try {
      const updated = await this.prisma.supplier.update({
        where: { id },
        data: dto,
      });
      await this.audit.log({
        userId,
        entityType: 'Supplier',
        entityId: id,
        action: AuditAction.UPDATE,
        before: existing,
        after: updated,
      });
      return updated;
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async remove(id: string, userId: string) {
    const existing = await this.findOne(id);
    const deleted = await this.prisma.supplier.delete({ where: { id } });
    await this.audit.log({
      userId,
      entityType: 'Supplier',
      entityId: id,
      action: AuditAction.DELETE,
      before: existing,
    });
    return deleted;
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
