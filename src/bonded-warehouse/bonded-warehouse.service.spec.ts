import { BadRequestException } from '@nestjs/common';
import { BondedMovementType } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import { BondedWarehouseService } from './bonded-warehouse.service';

function makePrisma(items: unknown[] = []) {
  const bondedWarehouseItem = {
    create: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(args.data),
    ),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue(items),
    update: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(args.data),
    ),
    updateMany: jest.fn().mockResolvedValue({ count: items.length }),
    count: jest.fn().mockResolvedValue(items.length),
    delete: jest.fn().mockResolvedValue({}),
  };
  const bondedWarehouseMovement = {
    create: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(args.data),
    ),
  };
  const warehouseLocation = {
    findUnique: jest
      .fn()
      .mockResolvedValue({ id: 'loc_released', name: 'RELEASED' }),
    create: jest
      .fn()
      .mockResolvedValue({ id: 'loc_released', name: 'RELEASED' }),
  };
  const clearanceJob = {
    findUnique: jest.fn(),
  };
  const prisma = {
    bondedWarehouseItem,
    bondedWarehouseMovement,
    warehouseLocation,
    clearanceJob,
    $transaction: jest.fn(
      (arg: Promise<unknown>[] | ((tx: unknown) => unknown)) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    ),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return {
    prisma: prisma as unknown as PrismaService,
    audit: audit as unknown as AuditService,
    bondedWarehouseItem,
    bondedWarehouseMovement,
    warehouseLocation,
    clearanceJob,
  };
}

describe('BondedWarehouseService', () => {
  it('initializes stock balance from quantity on create', async () => {
    const { prisma, audit } = makePrisma();
    const service = new BondedWarehouseService(prisma, audit);
    const created = (await service.create(
      { blNumber: 'BL1', quantity: 3 },
      'user_1',
    )) as { quantity: number; stockBalance: number; releasedQty: number };
    expect(created.stockBalance).toBe(3);
    expect(created.releasedQty).toBe(0);
  });

  it('defaults quantity/stock balance to 1', async () => {
    const { prisma, audit } = makePrisma();
    const service = new BondedWarehouseService(prisma, audit);
    const created = (await service.create({ blNumber: 'BL1' }, 'user_1')) as {
      quantity: number;
      stockBalance: number;
    };
    expect(created.quantity).toBe(1);
    expect(created.stockBalance).toBe(1);
  });

  it('rejects releasing more than the stock balance', async () => {
    const { prisma, audit, bondedWarehouseItem } = makePrisma();
    bondedWarehouseItem.findUnique.mockResolvedValue({
      id: 'i1',
      quantity: 2,
      releasedQty: 0,
      stockBalance: 2,
      currentLocation: 'KWB',
    });
    const service = new BondedWarehouseService(prisma, audit);
    await expect(
      service.addMovement(
        'i1',
        { type: BondedMovementType.RELEASE, quantity: 5 },
        'user_1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks the item released & duty-paid when the last unit leaves', async () => {
    const { prisma, audit, bondedWarehouseItem } = makePrisma();
    bondedWarehouseItem.findUnique.mockResolvedValue({
      id: 'i1',
      quantity: 1,
      releasedQty: 0,
      stockBalance: 1,
      currentLocation: 'KWB',
    });
    const service = new BondedWarehouseService(prisma, audit);
    await service.addMovement(
      'i1',
      { type: BondedMovementType.RELEASE, quantity: 1, dutyPaid: true },
      'user_1',
    );
    const updateArg = bondedWarehouseItem.update.mock.calls[0][0];
    expect(updateArg.data.stockBalance).toBe(0);
    expect(updateArg.data.currentLocation).toEqual({
      connect: { id: 'loc_released' },
    });
    expect(updateArg.data.dutyStatus).toBe('PAID');
  });

  it('aggregates a stock-movement summary grouped by B/L', async () => {
    const items = [
      {
        blNumber: 'BLA',
        invoicePackingNumber: 'INV1',
        brandName: 'TOYOTA',
        commodityCode: '8703',
        quantity: 1,
        stockBalance: 1,
        releasedQty: 0,
        currentLocation: { name: 'KWB' },
        dutyStatus: 'UNPAID',
        validDays: 180,
        receivedDateKwb: new Date('2026-01-01'),
      },
      {
        blNumber: 'BLA',
        invoicePackingNumber: 'INV1',
        brandName: 'TOYOTA',
        quantity: 1,
        stockBalance: 0,
        releasedQty: 1,
        currentLocation: { name: 'RELEASED' },
        dutyStatus: 'PAID',
        validDays: 180,
        receivedDateKwb: new Date('2026-01-02'),
      },
    ];
    const { prisma, audit } = makePrisma(items);
    const service = new BondedWarehouseService(prisma, audit);
    const rows = await service.summary({});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      blNumber: 'BLA',
      totalReceived: 2,
      qtyInKwb: 1,
      qtyDutyPaid: 1,
      qtyDutyUnpaid: 1,
      closed: false,
    });
  });

  it('coerces the outbound date on create', async () => {
    const { prisma, audit } = makePrisma();
    const service = new BondedWarehouseService(prisma, audit);
    const created = (await service.create(
      { blNumber: 'BL1', outboundDate: '2026-06-30' },
      'user_1',
    )) as { outboundDate: Date };
    expect(created.outboundDate).toBeInstanceOf(Date);
  });

  it('fans header fields out to a B/L group', async () => {
    const { prisma, audit, bondedWarehouseItem } = makePrisma();
    bondedWarehouseItem.updateMany.mockResolvedValue({ count: 3 });
    const service = new BondedWarehouseService(prisma, audit);
    const res = await service.updateShipment(
      { blNumber: 'BLA', fields: { importerName: 'ACME', validDays: 180 } },
      'user_1',
    );
    expect(res).toEqual({ updated: 3 });
    const arg = bondedWarehouseItem.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ blNumber: 'BLA' });
    expect(arg.data).toMatchObject({ importerName: 'ACME', validDays: 180 });
  });

  it('requires a group key to fan out a header', async () => {
    const { prisma, audit } = makePrisma();
    const service = new BondedWarehouseService(prisma, audit);
    await expect(
      service.updateShipment({ fields: { importerName: 'ACME' } }, 'user_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps a caller-supplied B/L when it is one of the job’s B/Ls', async () => {
    const { prisma, audit, clearanceJob } = makePrisma();
    clearanceJob.findUnique.mockResolvedValue({
      blBookingNumber: 'PRIMARY',
      blBookingNumbers: ['PRIMARY', 'SECOND'],
    });
    const service = new BondedWarehouseService(prisma, audit);
    const created = (await service.create(
      { blNumber: 'SECOND', clearanceJobId: 'job_1' },
      'user_1',
    )) as { blNumber: string };
    expect(created.blNumber).toBe('SECOND');
  });

  it('falls back to the job primary B/L when the supplied one is unknown', async () => {
    const { prisma, audit, clearanceJob } = makePrisma();
    clearanceJob.findUnique.mockResolvedValue({
      blBookingNumber: 'PRIMARY',
      blBookingNumbers: ['PRIMARY', 'SECOND'],
    });
    const service = new BondedWarehouseService(prisma, audit);
    const created = (await service.create(
      { blNumber: 'STRANGER', clearanceJobId: 'job_1' },
      'user_1',
    )) as { blNumber: string };
    expect(created.blNumber).toBe('PRIMARY');
  });

  it('filters by several comma-separated B/L numbers', async () => {
    const { prisma, audit, bondedWarehouseItem } = makePrisma();
    const service = new BondedWarehouseService(prisma, audit);
    await service.findAll({ page: 1, limit: 20, blNumbers: 'BLA, BLB' });
    const arg = bondedWarehouseItem.findMany.mock.calls[0][0];
    expect(arg.where.blNumber).toEqual({ in: ['BLA', 'BLB'] });
  });

  it('batch-releases every in-stock unit of a container, flipping duty', async () => {
    const items = [
      { id: 'i1', quantity: 1, stockBalance: 1, currentLocationId: 'kwb' },
      { id: 'i2', quantity: 2, stockBalance: 2, currentLocationId: 'kwb' },
    ];
    const { prisma, audit, bondedWarehouseItem } = makePrisma(items);
    const service = new BondedWarehouseService(prisma, audit);
    const res = await service.batchRelease(
      { blNumber: 'BLA', containerTruckNumber: 'C1', dutyPaid: true },
      'user_1',
    );
    expect(res).toEqual({ released: 2, totalQuantity: 3 });
    const firstUpdate = bondedWarehouseItem.update.mock.calls[0][0];
    expect(firstUpdate.data).toMatchObject({
      stockBalance: 0,
      releasedQty: 1,
      dutyStatus: 'PAID',
    });
  });

  it('rejects a batch release with no matching in-stock items', async () => {
    const { prisma, audit } = makePrisma([]);
    const service = new BondedWarehouseService(prisma, audit);
    await expect(
      service.batchRelease({ blNumber: 'BLA', dutyPaid: false }, 'user_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a group key to batch release', async () => {
    const { prisma, audit } = makePrisma();
    const service = new BondedWarehouseService(prisma, audit);
    await expect(
      service.batchRelease({ dutyPaid: false }, 'user_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bulk-creates a shipment header + items, keeping each item’s own B/L', async () => {
    const { prisma, audit } = makePrisma();
    const service = new BondedWarehouseService(prisma, audit);
    // No linked job → each item (container) keeps its own B/L (1–2 per shipment).
    const res = await service.createShipment(
      {
        blNumber: 'BLX',
        header: { importerName: 'ACME', validDays: 180 },
        items: [
          { blNumber: 'BLX', vin: 'V1' },
          { blNumber: 'BLY', vin: 'V2' },
        ],
      },
      'user_1',
    );
    expect(res).toMatchObject({ blNumber: 'BLX', created: 2 });
    expect(prisma.$transaction).toHaveBeenCalled();
    // header fields merged onto every row; per-container B/L preserved
    expect(res.items[0]).toMatchObject({
      blNumber: 'BLX',
      importerName: 'ACME',
      vin: 'V1',
    });
    expect(res.items[1]).toMatchObject({ blNumber: 'BLY', vin: 'V2' });
  });

  it('falls back to the job primary B/L for an item B/L not on the shipment', async () => {
    const { prisma, audit, clearanceJob } = makePrisma();
    clearanceJob.findUnique.mockResolvedValue({
      blBookingNumber: 'PRIMARY',
      blBookingNumbers: ['PRIMARY', 'SECOND'],
    });
    const service = new BondedWarehouseService(prisma, audit);
    const res = await service.createShipment(
      {
        blNumber: 'PRIMARY',
        clearanceJobId: 'job_1',
        header: {},
        items: [
          { blNumber: 'SECOND', vin: 'V1' }, // valid secondary → kept
          { blNumber: 'STRANGER', vin: 'V2' }, // not on job → primary
        ],
      },
      'user_1',
    );
    expect(res.items[0]).toMatchObject({ blNumber: 'SECOND' });
    expect(res.items[1]).toMatchObject({ blNumber: 'PRIMARY' });
  });
});
