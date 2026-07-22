import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, Customer, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly audit: AuditService,
  ) {}

  /** `representativeImageUrl` stores an S3 key — resolve to a presigned GET URL. */
  private async withImage(customer: Customer): Promise<Customer> {
    if (!customer.representativeImageUrl) return customer;
    try {
      return {
        ...customer,
        representativeImageUrl: await this.s3.presignGet(
          customer.representativeImageUrl,
        ),
      };
    } catch (err) {
      this.logger.error(
        `Failed to presign image for customer ${customer.id}: ${err}`,
      );
      return customer;
    }
  }

  async create(dto: CreateCustomerDto, userId: string) {
    const code =
      dto.code ||
      `CUST-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    try {
      const customer = await this.prisma.customer.create({
        data: {
          ...dto,
          code,
          registrationDate: new Date(dto.registrationDate),
        },
      });
      await this.audit.log({
        userId,
        entityType: 'Customer',
        entityId: customer.id,
        action: AuditAction.CREATE,
        after: customer,
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

  async update(id: string, dto: UpdateCustomerDto, userId: string) {
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
      const updated = await this.prisma.customer.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.registrationDate
            ? { registrationDate: new Date(dto.registrationDate) }
            : {}),
        },
      });
      await this.audit.log({
        userId,
        entityType: 'Customer',
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
    const existing = await this.findRaw(id);
    const deleted = await this.prisma.customer.delete({ where: { id } });
    await this.audit.log({
      userId,
      entityType: 'Customer',
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
      return new ConflictException('A customer with this code already exists');
    }
    return e;
  }
}
