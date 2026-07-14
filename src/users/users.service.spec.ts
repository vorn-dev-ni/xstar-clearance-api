import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';
import type { CreateUserDto } from './dto/create-user.dto';

function makePrisma(existing: unknown = null) {
  const create = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'u_1', ...args.data }),
  );
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create,
    },
  };
  return { prisma: prisma as unknown as PrismaService, create };
}

const dto: CreateUserDto = {
  email: 'new@stlogistics.com',
  password: 'supersecret',
  firstName: 'New',
  lastName: 'User',
};

describe('UsersService.create', () => {
  it('hashes the password before persisting', async () => {
    const { prisma, create } = makePrisma();
    const service = new UsersService(prisma);

    await service.create(dto);

    const data = create.mock.calls[0][0].data as { password: string };
    expect(data.password).not.toBe(dto.password);
    expect(await bcrypt.compare(dto.password, data.password)).toBe(true);
  });

  it('rejects a duplicate email', async () => {
    const { prisma } = makePrisma({ id: 'existing' });
    const service = new UsersService(prisma);

    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
  });
});
