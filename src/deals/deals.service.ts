import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DealStatus, Prisma } from '@prisma/client';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { OperationsService } from '../operations/operations.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConvertDealDto } from './dto/convert-deal.dto';
import { CreateDealDto } from './dto/create-deal.dto';
import { ListDealsDto } from './dto/list-deals.dto';
import { UpdateDealDto } from './dto/update-deal.dto';

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: OperationsService,
  ) {}

  async create(dto: CreateDealDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const dealNumber = await nextDealNumber(tx);
      return tx.deal.create({
        data: { ...dto, dealNumber, createdBy: userId },
      });
    });
  }

  /** Predicted next auto deal number — the actual number is assigned at save. */
  async nextNumber() {
    const dealNumber = await nextDealNumber(this.prisma);
    return { dealNumber };
  }

  async findAll(query: ListDealsDto) {
    const where: Prisma.DealWhereInput = {
      status: query.status,
      customerId: query.customerId,
      dealNumber: query.search
        ? { contains: query.search, mode: 'insensitive' }
        : undefined,
    };
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.deal.findMany({
        where,
        include: {
          customer: { select: { nameEn: true } },
          salesperson: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.deal.count({ where }),
    ]);
    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }

  async findOne(id: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: {
        customer: true,
        salesperson: { select: { id: true, firstName: true, lastName: true } },
        clearanceJobs: {
          select: { id: true, jobNumber: true, status: true, date: true },
          orderBy: { date: 'desc' },
        },
      },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  async update(id: string, dto: UpdateDealDto) {
    await this.findOne(id);
    return this.prisma.deal.update({ where: { id }, data: dto });
  }

  /**
   * Convert a won deal into a clearance job: mark the deal WON and create a
   * ClearanceJob seeded from it, linked back via `dealId`. Reuses
   * OperationsService so job numbering / staff resolution stays in one place.
   */
  async convert(id: string, dto: ConvertDealDto, userId: string) {
    const deal = await this.findOne(id);
    if (deal.status === DealStatus.LOST) {
      throw new UnprocessableEntityException('A lost deal cannot be converted');
    }

    const job = await this.operations.create(
      {
        date: dto.date ?? new Date().toISOString(),
        jobNumber: dto.jobNumber,
        customerId: deal.customerId,
        dealId: deal.id,
        transaction: deal.shipmentType ?? undefined,
        transportMode: deal.transportMode ?? undefined,
        originCountry: deal.originCountry ?? undefined,
        originPort: deal.originPort ?? undefined,
        destinationCountry: deal.destinationCountry ?? undefined,
        destinationPort: deal.destinationPort ?? undefined,
        estimatedRevenue:
          deal.estimatedRevenue != null
            ? Number(deal.estimatedRevenue)
            : undefined,
        assignedStaffId: dto.assignedStaffId,
      },
      userId,
    );

    await this.prisma.deal.update({
      where: { id },
      data: { status: DealStatus.WON },
    });

    return job;
  }
}

async function nextDealNumber(
  tx: Pick<Prisma.TransactionClient, 'deal'>,
): Promise<string> {
  const count = await tx.deal.count();
  return `DEAL-${String(count + 1).padStart(6, '0')}`;
}
