import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { S3Service } from '../storage/s3.service';
import { UsersService } from './users.service';
import type { CreateUserDto } from './dto/create-user.dto';

function makeService(existing: unknown = null) {
  const create = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'u_1', ...args.data }),
  );
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create,
    },
  };
  const s3 = { presignGet: jest.fn() };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    s3 as unknown as S3Service,
    audit as unknown as AuditService,
  );
  return { service, create, audit };
}

const dto: CreateUserDto = {
  email: 'new@stlogistics.com',
  password: 'supersecret',
  firstName: 'New',
  lastName: 'User',
};

describe('UsersService.create', () => {
  it('hashes the password before persisting', async () => {
    const { service, create, audit } = makeService();

    await service.create(dto, 'admin_1');

    const data = create.mock.calls[0][0].data as { password: string };
    expect(data.password).not.toBe(dto.password);
    expect(await bcrypt.compare(dto.password, data.password)).toBe(true);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate email', async () => {
    const { service } = makeService({ id: 'existing' });

    await expect(service.create(dto, 'admin_1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
