import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClearanceJobDto } from './dto/create-clearance-job.dto';
import { ListClearanceJobsDto } from './dto/list-clearance-jobs.dto';
import { UpdateClearanceJobDto } from './dto/update-clearance-job.dto';

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClearanceJobDto, userId: string) {
    try {
      return await this.prisma.clearanceJob.create({
        data: { ...dto, date: new Date(dto.date), createdBy: userId },
      });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async findAll(query: ListClearanceJobsDto) {
    const where: Prisma.ClearanceJobWhereInput = {
      customerId: query.customerId,
      shipmentStatus: query.shipmentStatus,
      ...(query.search
        ? {
            OR: [
              { jobNumber: { contains: query.search, mode: 'insensitive' } },
              {
                blBookingNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.clearanceJob.findMany({
        where,
        include: { customer: { select: { nameEn: true } } },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      this.prisma.clearanceJob.count({ where }),
    ]);
    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }

  async findOne(id: string) {
    const job = await this.prisma.clearanceJob.findUnique({
      where: { id },
      include: { customer: true, incomeRecord: true },
    });
    if (!job) throw new NotFoundException('Clearance job not found');
    return job;
  }

  async update(id: string, dto: UpdateClearanceJobDto) {
    await this.findOne(id);
    try {
      return await this.prisma.clearanceJob.update({
        where: { id },
        data: { ...dto, ...(dto.date ? { date: new Date(dto.date) } : {}) },
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
        'A clearance job with this job number already exists',
      );
    }
    return e;
  }
}
