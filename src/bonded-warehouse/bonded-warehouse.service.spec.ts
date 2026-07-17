import { BadRequestException } from '@nestjs/common';
import { BondedMovementType } from '@prisma/client';
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
    count: jest.fn().mockResolvedValue(items.length),
    delete: jest.fn().mockResolvedValue({}),
  };
  const bondedWarehouseMovement = {
    create: jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(args.data),
    ),
  };
  const prisma = {
    bondedWarehouseItem,
    bondedWarehouseMovement,
    $transaction: jest.fn(
      (arg: Promise<unknown>[] | ((tx: unknown) => unknown)) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    ),
  };
  return {
    prisma: prisma as unknown as PrismaService,
    bondedWarehouseItem,
    bondedWarehouseMovement,
  };
}

describe('BondedWarehouseService', () => {
  it('initializes stock balance from quantity on create', async () => {
    const { prisma } = makePrisma();
    const service = new BondedWarehouseService(prisma);
    const created = (await service.create(
      { blNumber: 'BL1', quantity: 3 },
      'user_1',
    )) as { quantity: number; stockBalance: number; releasedQty: number };
    expect(created.stockBalance).toBe(3);
    expect(created.releasedQty).toBe(0);
  });

  it('defaults quantity/stock balance to 1', async () => {
    const { prisma } = makePrisma();
    const service = new BondedWarehouseService(prisma);
    const created = (await service.create({ blNumber: 'BL1' }, 'user_1')) as {
      quantity: number;
      stockBalance: number;
    };
    expect(created.quantity).toBe(1);
    expect(created.stockBalance).toBe(1);
  });

  it('rejects releasing more than the stock balance', async () => {
    const { prisma, bondedWarehouseItem } = makePrisma();
    bondedWarehouseItem.findUnique.mockResolvedValue({
      id: 'i1',
      quantity: 2,
      releasedQty: 0,
      stockBalance: 2,
      currentLocation: 'KWB',
    });
    const service = new BondedWarehouseService(prisma);
    await expect(
      service.addMovement(
        'i1',
        { type: BondedMovementType.RELEASE, quantity: 5 },
        'user_1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks the item released & duty-paid when the last unit leaves', async () => {
    const { prisma, bondedWarehouseItem } = makePrisma();
    bondedWarehouseItem.findUnique.mockResolvedValue({
      id: 'i1',
      quantity: 1,
      releasedQty: 0,
      stockBalance: 1,
      currentLocation: 'KWB',
    });
    const service = new BondedWarehouseService(prisma);
    await service.addMovement(
      'i1',
      { type: BondedMovementType.RELEASE, quantity: 1, dutyPaid: true },
      'user_1',
    );
    const updateArg = bondedWarehouseItem.update.mock.calls[0][0];
    expect(updateArg.data.stockBalance).toBe(0);
    expect(updateArg.data.currentLocation).toBe('RELEASED');
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
        currentLocation: 'KWB',
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
        currentLocation: 'RELEASED',
        dutyStatus: 'PAID',
        validDays: 180,
        receivedDateKwb: new Date('2026-01-02'),
      },
    ];
    const { prisma } = makePrisma(items);
    const service = new BondedWarehouseService(prisma);
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
});
