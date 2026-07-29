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
  const prisma = {
    bondedWarehouseItem,
    bondedWarehouseMovement,
    warehouseLocation,
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

  it('bulk-creates a shipment header + items in one transaction', async () => {
    const { prisma, audit } = makePrisma();
    const service = new BondedWarehouseService(prisma, audit);
    const res = await service.createShipment(
      {
        blNumber: 'BLX',
        header: { importerName: 'ACME', validDays: 180 },
        items: [
          { blNumber: 'ignored', vin: 'V1' },
          { blNumber: 'ignored', vin: 'V2' },
        ],
      },
      'user_1',
    );
    expect(res).toMatchObject({ blNumber: 'BLX', created: 2 });
    expect(prisma.$transaction).toHaveBeenCalled();
    // header fields are merged onto every row, group B/L wins
    expect(res.items[0]).toMatchObject({
      blNumber: 'BLX',
      importerName: 'ACME',
      vin: 'V1',
    });
  });
});
