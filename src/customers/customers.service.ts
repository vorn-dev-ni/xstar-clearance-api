import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /** `representativeImageUrl` stores an S3 key — resolve to a presigned GET URL. */
  private async withImage(customer: Customer): Promise<Customer> {
    if (!customer.representativeImageUrl) return customer;
    return {
      ...customer,
      representativeImageUrl: await this.s3.presignGet(
        customer.representativeImageUrl,
      ),
    };
  }

  async create(dto: CreateCustomerDto) {
    const code =
      dto.code ||
      `CUST-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    try {
      const customer = await this.prisma.customer.create({
        data: { ...dto, code, registrationDate: new Date(dto.registrationDate) },
      });
      return this.withImage(customer);
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
    return {
      data: await Promise.all(data.map((c) => this.withImage(c))),
      pagination: paginationMeta(total, query.page, query.limit),
    };
  }

  private async findRaw(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async findOne(id: string) {
    return this.withImage(await this.findRaw(id));
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const existing = await this.findRaw(id);
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

  async remove(id: string) {
    await this.findRaw(id);
    return this.prisma.customer.delete({ where: { id } });
  }

  private mapUniqueError(e: unknown): unknown {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException(
        'A customer with this code already exists',
      );
    }
    return e;
  }
}
