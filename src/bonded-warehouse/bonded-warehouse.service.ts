import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BondedDutyStatus, BondedMovementType, Prisma } from '@prisma/client';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBondedItemDto } from './dto/create-bonded-item.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { ListBondedItemsDto } from './dto/list-bonded-items.dto';
import { UpdateBondedItemDto } from './dto/update-bonded-item.dto';

/** One aggregated row of the "Stock Movement Summary" sheet (grouped by B/L). */
export interface StockMovementSummaryRow {
  blNumber: string;
  invoicePackingNumber: string | null;
  itemType: string | null; // brand / commodity category
  receivedDate: Date | null; // earliest received date on the B/L
  totalReceived: number;
  qtyInKwb: number;
  qtyInShowroom: number;
  qtyDutyPaid: number;
  qtyDutyUnpaid: number;
  dutySuspensionDays: number | null; // max validDays; null when fully closed
  closed: boolean; // all units released
}

@Injectable()
export class BondedWarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBondedItemDto, userId: string) {
    const quantity = dto.quantity ?? 1;
    return this.prisma.bondedWarehouseItem.create({
      data: {
        ...toItemData(dto),
        blNumber: dto.blNumber,
        quantity,
        releasedQty: 0,
        stockBalance: quantity,
        createdBy: userId,
      },
    });
  }

  async findAll(query: ListBondedItemsDto) {
    const where = buildWhere(query);
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.bondedWarehouseItem.findMany({
        where,
        include: {
          clearanceJob: { select: { id: true, jobNumber: true } },
        },
        orderBy: [{ receivedDateKwb: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.bondedWarehouseItem.count({ where }),
    ]);
    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }

  async findOne(id: string) {
    const item = await this.prisma.bondedWarehouseItem.findUnique({
      where: { id },
      include: {
        clearanceJob: { select: { id: true, jobNumber: true } },
        movements: { orderBy: { date: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException('Bonded warehouse item not found');
    return item;
  }

  async update(id: string, dto: UpdateBondedItemDto) {
    const existing = await this.prisma.bondedWarehouseItem.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException('Bonded warehouse item not found');

    // Keep stockBalance consistent if quantity is edited.
    const quantity = dto.quantity ?? existing.quantity;
    const stockBalance = quantity - existing.releasedQty;

    return this.prisma.bondedWarehouseItem.update({
      where: { id },
      data: {
        ...toItemData(dto),
        ...(dto.quantity !== undefined
          ? { quantity, stockBalance: Math.max(0, stockBalance) }
          : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.bondedWarehouseItem.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Record a stock movement. A RELEASE increments releasedQty and reduces the
   * stock balance; when duty-paid it flips the item to PAID. A TRANSFER /
   * LOCATION_UPDATE moves the unit to a new location.
   */
  async addMovement(itemId: string, dto: CreateMovementDto, userId: string) {
    const item = await this.prisma.bondedWarehouseItem.findUnique({
      where: { id: itemId },
    });
    if (!item) throw new NotFoundException('Bonded warehouse item not found');

    const qty = dto.quantity ?? 1;
    const fromLocationId = item.currentLocationId;

    const data: Prisma.BondedWarehouseItemUpdateInput = {};

    if (dto.type === BondedMovementType.RELEASE) {
      if (qty > item.stockBalance) {
        throw new BadRequestException(
          `Cannot release ${qty} unit(s); only ${item.stockBalance} remain in stock`,
        );
      }
      const releasedQty = item.releasedQty + qty;
      const stockBalance = item.quantity - releasedQty;
      data.releasedQty = releasedQty;
      data.stockBalance = stockBalance;
      if (stockBalance === 0) {
        let releasedLoc = await this.prisma.warehouseLocation.findUnique({
          where: { name: 'RELEASED' },
        });
        if (!releasedLoc)
          releasedLoc = await this.prisma.warehouseLocation.create({
            data: { name: 'RELEASED' },
          });
        data.currentLocation = { connect: { id: releasedLoc.id } };
      }
      if (dto.dutyPaid) data.dutyStatus = BondedDutyStatus.PAID;
    } else {
      // TRANSFER / LOCATION_UPDATE
      if (dto.toLocationId)
        data.currentLocation = { connect: { id: dto.toLocationId } };
    }

    const [movement] = await this.prisma.$transaction([
      this.prisma.bondedWarehouseMovement.create({
        data: {
          itemId,
          type: dto.type,
          quantity: qty,
          fromLocationId,
          toLocationId: dto.toLocationId ?? null,
          dutyPaid: dto.dutyPaid ?? false,
          sadId: dto.sadId,
          note: dto.note,
          date: dto.date ? new Date(dto.date) : new Date(),
          createdBy: userId,
        },
      }),
      this.prisma.bondedWarehouseItem.update({ where: { id: itemId }, data }),
    ]);
    return movement;
  }

  /**
   * Stock Movement Summary — aggregates stock detail rows by B/L into the
   * client's summary sheet shape. Computed on the fly so it always reconciles
   * with the detail rows.
   */
  async summary(query: {
    clearanceJobId?: string;
    blNumber?: string;
  }): Promise<StockMovementSummaryRow[]> {
    const items = await this.prisma.bondedWarehouseItem.findMany({
      where: {
        clearanceJobId: query.clearanceJobId,
        blNumber: query.blNumber,
      },
      include: { currentLocation: true },
      orderBy: { receivedDateKwb: 'asc' },
    });

    const byBl = new Map<string, StockMovementSummaryRow>();
    for (const it of items) {
      const key = it.blNumber;
      let row = byBl.get(key);
      if (!row) {
        row = {
          blNumber: key,
          invoicePackingNumber: it.invoicePackingNumber,
          itemType: it.brandName ?? it.commodityCode ?? null,
          receivedDate: it.receivedDateKwb,
          totalReceived: 0,
          qtyInKwb: 0,
          qtyInShowroom: 0,
          qtyDutyPaid: 0,
          qtyDutyUnpaid: 0,
          dutySuspensionDays: null,
          closed: true,
        };
        byBl.set(key, row);
      }

      row.totalReceived += it.quantity;
      const inStock = it.stockBalance;
      if (it.currentLocation?.name === 'KWB') row.qtyInKwb += inStock;
      if (it.currentLocation?.name === 'SHOWROOM') row.qtyInShowroom += inStock;

      if (it.dutyStatus === BondedDutyStatus.PAID) {
        row.qtyDutyPaid += it.releasedQty || it.quantity;
      } else {
        row.qtyDutyUnpaid += it.stockBalance;
      }

      if (it.stockBalance > 0) row.closed = false;
      if (it.validDays != null) {
        row.dutySuspensionDays = Math.max(
          row.dutySuspensionDays ?? 0,
          it.validDays,
        );
      }
      if (
        it.receivedDateKwb &&
        (!row.receivedDate || it.receivedDateKwb < row.receivedDate)
      ) {
        row.receivedDate = it.receivedDateKwb;
      }
    }

    return [...byBl.values()];
  }
}

/** Whitelist + date-coerce the DTO fields that map directly onto the model. */
function toItemData(
  dto: CreateBondedItemDto | UpdateBondedItemDto,
): Record<string, unknown> {
  const { receivedDateKwb, etaDate, transitDate, inboundDate, ...rest } = dto;
  return {
    ...rest,
    ...(receivedDateKwb ? { receivedDateKwb: new Date(receivedDateKwb) } : {}),
    ...(etaDate ? { etaDate: new Date(etaDate) } : {}),
    ...(transitDate ? { transitDate: new Date(transitDate) } : {}),
    ...(inboundDate ? { inboundDate: new Date(inboundDate) } : {}),
  };
}

function buildWhere(
  query: ListBondedItemsDto,
): Prisma.BondedWarehouseItemWhereInput {
  return {
    clearanceJobId: query.clearanceJobId,
    blNumber: query.blNumber,
    currentLocationId: query.currentLocationId,
    dutyStatus: query.dutyStatus,
    ...(query.search
      ? {
          OR: [
            { blNumber: { contains: query.search, mode: 'insensitive' } },
            { vin: { contains: query.search, mode: 'insensitive' } },
            { engineNumber: { contains: query.search, mode: 'insensitive' } },
            { brandName: { contains: query.search, mode: 'insensitive' } },
            {
              invoicePackingNumber: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
          ],
        }
      : {}),
  };
}
