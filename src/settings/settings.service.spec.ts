import { UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { SettingsService } from './settings.service';

const s3 = {
  presignGet: jest.fn().mockResolvedValue('https://s3.example/logo?sig'),
} as unknown as S3Service;

/**
 * Mock Prisma whose `$transaction(cb)` runs the callback with a `tx` that
 * records the taxRate writes, so we can assert the single-default invariant.
 */
function makePrisma(existing?: { id: string; isDefault: boolean }) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const update = jest.fn((args: unknown) => Promise.resolve(args));
  const del = jest.fn().mockResolvedValue({});
  const tx = { taxRate: { updateMany, update, delete: del } };
  const prisma = {
    taxRate: {
      findUnique: jest.fn().mockResolvedValue(existing ?? null),
      delete: del,
    },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  return {
    prisma: prisma as unknown as PrismaService,
    updateMany,
    update,
    del,
  };
}

describe('SettingsService tax rates', () => {
  it('setDefaultTaxRate demotes all others then promotes the target', async () => {
    const { prisma, updateMany, update } = makePrisma({
      id: 'tr_1',
      isDefault: false,
    });
    const service = new SettingsService(prisma, s3);

    await service.setDefaultTaxRate('tr_1');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { not: 'tr_1' } },
      data: { isDefault: false },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'tr_1' },
      data: { isDefault: true, isActive: true },
    });
  });

  it('refuses to delete the default tax rate', async () => {
    const { prisma } = makePrisma({ id: 'tr_1', isDefault: true });
    const service = new SettingsService(prisma, s3);

    await expect(service.removeTaxRate('tr_1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

describe('SettingsService company logo', () => {
  function makeCompanyPrisma(logo: string | null, file?: { status: string }) {
    return {
      companySettings: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cs_1', logo }),
      },
      fileUpload: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            file ? { key: 'uploads/x/logo.png', ...file } : null,
          ),
      },
    } as unknown as PrismaService;
  }

  it('resolves logo fileId to a presigned URL', async () => {
    const service = new SettingsService(
      makeCompanyPrisma('file_1', { status: 'UPLOADED' }),
      s3,
    );
    const result = await service.getCompanySettings();
    expect(result.logoUrl).toBe('https://s3.example/logo?sig');
  });

  it('returns null logoUrl when no logo is set or file is missing', async () => {
    const none = new SettingsService(makeCompanyPrisma(null), s3);
    expect((await none.getCompanySettings()).logoUrl).toBeNull();

    const dangling = new SettingsService(makeCompanyPrisma('file_gone'), s3);
    expect((await dangling.getCompanySettings()).logoUrl).toBeNull();
  });
});
