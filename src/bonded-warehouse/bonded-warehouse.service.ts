import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  BondedDutyStatus,
  BondedMovementType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBondedItemDto } from './dto/create-bonded-item.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { ListBondedItemsDto } from './dto/list-bonded-items.dto';
import { CreateShipmentDto, UpdateShipmentDto } from './dto/shipment.dto';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateBondedItemDto, userId: string) {
    const quantity = dto.quantity ?? 1;
    // The shipment is the source of truth for the B/L: when linked to a job,
    // use the job's B/L rather than any client-supplied value.
    const blNumber = await this.resolveBlNumber(dto.clearanceJobId, dto.blNumber);
    const item = await this.prisma.bondedWarehouseItem.create({
      data: {
        ...toItemData(dto),
        blNumber,
        quantity,
        releasedQty: 0,
        stockBalance: quantity,
        createdBy: userId,
      },
    });
    await this.audit.log({
      userId,
      entityType: 'BondedItem',
      entityId: item.id,
      action: AuditAction.CREATE,
      after: { vin: item.vin, quantity: item.quantity },
    });
    return item;
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

  async update(id: string, dto: UpdateBondedItemDto, userId?: string) {
    const existing = await this.prisma.bondedWarehouseItem.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException('Bonded warehouse item not found');

    // Keep stockBalance consistent if quantity is edited.
    const quantity = dto.quantity ?? existing.quantity;
    const stockBalance = quantity - existing.releasedQty;

    const updated = await this.prisma.bondedWarehouseItem.update({
      where: { id },
      data: {
        ...toItemData(dto),
        ...(dto.quantity !== undefined
          ? { quantity, stockBalance: Math.max(0, stockBalance) }
          : {}),
      },
    });
    if (userId) {
      await this.audit.log({
        userId,
        entityType: 'BondedItem',
        entityId: id,
        action: AuditAction.UPDATE,
        before: { vin: existing.vin, quantity: existing.quantity },
        after: { vin: updated.vin, quantity: updated.quantity },
      });
    }
    return updated;
  }

  async remove(id: string, userId?: string) {
    const existing = await this.findOne(id);
    await this.prisma.bondedWarehouseItem.delete({ where: { id } });
    if (userId) {
      await this.audit.log({
        userId,
        entityType: 'BondedItem',
        entityId: id,
        action: AuditAction.DELETE,
        before: { vin: existing.vin, quantity: existing.quantity },
      });
    }
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
   * Fan-out update: apply the shared shipment-header fields to every stock item
   * in a B/L group (matched by clearanceJobId and/or blNumber). Returns the
   * number of items updated. At least one group key is required so we never
   * accidentally update the whole table.
   */
  async updateShipment(dto: UpdateShipmentDto, userId?: string) {
    if (!dto.clearanceJobId && !dto.blNumber) {
      throw new BadRequestException(
        'Provide clearanceJobId and/or blNumber to target a shipment group',
      );
    }
    const where: Prisma.BondedWarehouseItemWhereInput = {
      ...(dto.clearanceJobId ? { clearanceJobId: dto.clearanceJobId } : {}),
      ...(dto.blNumber ? { blNumber: dto.blNumber } : {}),
    };
    const data = toItemData(dto.fields);
    const result = await this.prisma.bondedWarehouseItem.updateMany({
      where,
      data,
    });
    if (userId) {
      await this.audit.log({
        userId,
        entityType: 'BondedShipment',
        entityId: dto.blNumber ?? dto.clearanceJobId ?? 'unknown',
        action: AuditAction.UPDATE,
        after: { updated: result.count, ...data },
      });
    }
    return { updated: result.count };
  }

  /**
   * Bulk create a shipment: one shared header applied to every provided item
   * row, all in a single transaction. Each item carries the group's blNumber /
   * clearanceJobId and the shared header fields, then its own per-unit data.
   */
  async createShipment(dto: CreateShipmentDto, userId: string) {
    const header = toItemData(dto.header);
    // The shipment (job) is authoritative for the B/L when one is linked.
    const blNumber = await this.resolveBlNumber(dto.clearanceJobId, dto.blNumber);
    const created = await this.prisma.$transaction(
      dto.items.map((item) => {
        const quantity = item.quantity ?? 1;
        return this.prisma.bondedWarehouseItem.create({
          data: {
            ...header,
            ...toItemData(item),
            blNumber,
            clearanceJobId: dto.clearanceJobId ?? item.clearanceJobId ?? null,
            quantity,
            releasedQty: 0,
            stockBalance: quantity,
            createdBy: userId,
          },
        });
      }),
    );
    await this.audit.log({
      userId,
      entityType: 'BondedShipment',
      entityId: blNumber,
      action: AuditAction.CREATE,
      after: { blNumber, items: created.length },
    });
    return { blNumber, created: created.length, items: created };
  }

  /**
   * The linked shipment is the source of truth for a bonded item's B/L. When a
   * `clearanceJobId` is given, return that job's `blBookingNumber`; otherwise
   * fall back to the supplied value.
   */
  private async resolveBlNumber(
    clearanceJobId: string | undefined,
    fallback: string,
  ): Promise<string> {
    if (!clearanceJobId) return fallback;
    const job = await this.prisma.clearanceJob.findUnique({
      where: { id: clearanceJobId },
      select: { blBookingNumber: true },
    });
    return job?.blBookingNumber || fallback;
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

/** Date-coercible item/header fields handled specially by {@link toItemData}. */
type ItemDataInput = Partial<
  Pick<
    CreateBondedItemDto,
    'receivedDateKwb' | 'outboundDate' | 'etaDate' | 'transitDate' | 'inboundDate'
  >
> &
  Record<string, unknown>;

/** Whitelist + date-coerce the DTO fields that map directly onto the model. */
function toItemData(input: object): Record<string, unknown> {
  const {
    receivedDateKwb,
    outboundDate,
    etaDate,
    transitDate,
    inboundDate,
    ...rest
  } = input as ItemDataInput;
  return {
    ...rest,
    ...(receivedDateKwb ? { receivedDateKwb: new Date(receivedDateKwb) } : {}),
    ...(outboundDate ? { outboundDate: new Date(outboundDate) } : {}),
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
