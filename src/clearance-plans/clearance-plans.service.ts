import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, ClearancePlanStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { CreateClearancePlanDto } from './dto/create-clearance-plan.dto';
import { UpdateClearancePlanDto } from './dto/update-clearance-plan.dto';
import { ListClearancePlansDto } from './dto/list-clearance-plans.dto';

const planInclude = {
  clearanceJob: { select: { jobNumber: true, blBookingNumber: true } },
} satisfies Prisma.ClearancePlanInclude;

/** Ordered clearance lifecycle. Status may only move ±1 step; the last is terminal. */
const CLEARANCE_PLAN_LIFECYCLE: ClearancePlanStatus[] = [
  ClearancePlanStatus.TRANSIT_DOCS_APPROVED,
  ClearancePlanStatus.CONTAINER_ARRIVED_DRY_PORT,
  ClearancePlanStatus.CUSTOMS_VALUATION_APPROVED,
  ClearancePlanStatus.CLEARANCE_IN_PROGRESS,
  ClearancePlanStatus.CLEARANCE_COMPLETED,
];

@Injectable()
export class ClearancePlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The linked Shipment must exist — its BL is the plan row's Bill of Loading. */
  private async assertJob(clearanceJobId: string) {
    const job = await this.prisma.clearanceJob.findUnique({
      where: { id: clearanceJobId },
      select: { id: true },
    });
    if (!job) throw new BadRequestException('Linked shipment not found');
  }

  private buildWhere(
    query: ListClearancePlansDto,
  ): Prisma.ClearancePlanWhereInput {
    return {
      clearanceJobId: query.clearanceJobId,
      ...(query.dateFrom || query.dateTo
        ? {
            clearanceDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { container: { contains: query.search, mode: 'insensitive' } },
              { seal: { contains: query.search, mode: 'insensitive' } },
              { commodity: { contains: query.search, mode: 'insensitive' } },
              { consignee: { contains: query.search, mode: 'insensitive' } },
              {
                clearanceJob: {
                  blBookingNumber: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  async create(dto: CreateClearancePlanDto, userId: string) {
    await this.assertJob(dto.clearanceJobId);
    return this.prisma.clearancePlan.create({
      data: {
        clearanceJobId: dto.clearanceJobId,
        container: dto.container,
        consignee: dto.consignee,
        size: dto.size,
        seal: dto.seal,
        commodity: dto.commodity,
        port: dto.port,
        clearanceDate: dto.clearanceDate
          ? new Date(dto.clearanceDate)
          : undefined,
        notes: dto.notes,
        createdBy: userId,
      },
      include: planInclude,
    });
  }

  async findAll(query: ListClearancePlansDto) {
    const where = this.buildWhere(query);
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.clearancePlan.findMany({
        where,
        include: planInclude,
        orderBy: [{ clearanceDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.clearancePlan.count({ where }),
    ]);
    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }

  /** Unpaginated fetch for exports (capped at 1000). */
  async findAllForExport(query: ListClearancePlansDto) {
    return this.prisma.clearancePlan.findMany({
      where: this.buildWhere(query),
      include: planInclude,
      orderBy: [{ clearanceDate: 'asc' }, { createdAt: 'asc' }],
      take: 1000,
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.clearancePlan.findUnique({
      where: { id },
      include: planInclude,
    });
    if (!plan) throw new NotFoundException('Clearance plan not found');
    return plan;
  }

  async update(id: string, dto: UpdateClearancePlanDto) {
    await this.findOne(id);
    if (dto.clearanceJobId) await this.assertJob(dto.clearanceJobId);
    return this.prisma.clearancePlan.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.clearanceDate !== undefined
          ? {
              clearanceDate: dto.clearanceDate
                ? new Date(dto.clearanceDate)
                : null,
            }
          : {}),
      },
      include: planInclude,
    });
  }

  /**
   * Advance a clearance plan through its lifecycle one step at a time. Once it
   * reaches CLEARANCE_COMPLETED the plan is locked and can no longer move.
   */
  async updateStatus(id: string, status: ClearancePlanStatus, userId: string) {
    const plan = await this.prisma.clearancePlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Clearance plan not found');

    // Completed is terminal — fully locked once reached.
    if (plan.status === ClearancePlanStatus.CLEARANCE_COMPLETED) {
      throw new ConflictException('Completed clearance plans are locked');
    }
    // Only single-step moves (forward or back); no skipping.
    const from = CLEARANCE_PLAN_LIFECYCLE.indexOf(plan.status);
    const to = CLEARANCE_PLAN_LIFECYCLE.indexOf(status);
    if (to < 0 || Math.abs(to - from) !== 1) {
      throw new ConflictException('Status can only move one step at a time');
    }

    const updated = await this.prisma.clearancePlan.update({
      where: { id },
      data: { status },
      include: planInclude,
    });
    await this.audit.log({
      userId,
      entityType: 'ClearancePlan',
      entityId: id,
      action: AuditAction.UPDATE,
      before: { status: plan.status },
      after: { status: updated.status },
    });
    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.clearancePlan.delete({ where: { id } });
    return { id };
  }
}
