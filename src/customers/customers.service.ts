import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustomerDto) {
    try {
      return await this.prisma.customer.create({
        data: { ...dto, registrationDate: new Date(dto.registrationDate) },
      });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async findAll(query: ListCustomersDto) {
    const where: Prisma.CustomerWhereInput = {
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
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const existing = await this.findOne(id);
    if (
      dto.isActive !== undefined &&
      dto.isActive !== existing.isActive &&
      !dto.remark?.trim()
    ) {
      throw new UnprocessableEntityException(
        'A remark is required when changing customer status',
      );
    }
    try {
      return await this.prisma.customer.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.registrationDate
            ? { registrationDate: new Date(dto.registrationDate) }
            : {}),
        },
      });
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
        'A customer with this code or tax ID already exists',
      );
    }
    return e;
  }
}
