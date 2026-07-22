import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { CreateWarehouseLocationDto } from './dto/create-warehouse-location.dto';
import { UpdateWarehouseLocationDto } from './dto/update-warehouse-location.dto';
import { ListWarehouseLocationsDto } from './dto/list-warehouse-locations.dto';

@Injectable()
export class WarehouseLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWarehouseLocationDto) {
    const existing = await this.prisma.warehouseLocation.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        'A warehouse location with this name already exists',
      );
    }
    return this.prisma.warehouseLocation.create({
      data: dto,
    });
  }

  async findAll(query: ListWarehouseLocationsDto) {
    const where: Prisma.WarehouseLocationWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.warehouseLocation.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.warehouseLocation.count({ where }),
    ]);
    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }

  async findOne(id: string) {
    const location = await this.prisma.warehouseLocation.findUnique({
      where: { id },
    });
    if (!location) throw new NotFoundException('Warehouse location not found');
    return location;
  }

  async update(id: string, dto: UpdateWarehouseLocationDto) {
    await this.findOne(id);
    if (dto.name) {
      const existing = await this.prisma.warehouseLocation.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException(
          'A warehouse location with this name already exists',
        );
      }
    }
    return this.prisma.warehouseLocation.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      await this.prisma.warehouseLocation.delete({ where: { id } });
      return { id };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new ConflictException(
          'This location has linked items or movements and cannot be deleted; deactivate it instead.',
        );
      }
      throw err;
    }
  }
}
