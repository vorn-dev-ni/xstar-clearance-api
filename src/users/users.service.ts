import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcryptjs';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 10;

/** A user row as selected by `publicSelect` (avatarUrl still an S3 key). */
type PublicUser = Prisma.UserGetPayload<{ select: typeof publicSelect }>;

/** Fields safe to return to clients — never the password hash. */
const publicSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  department: true,
  phone: true,
  isActive: true,
  avatarUrl: true,
  lastLogin: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly audit: AuditService,
  ) {}

  /** `avatarUrl` stores an S3 object key — resolve it to a presigned GET URL. */
  private async withAvatar<T extends PublicUser>(user: T): Promise<T> {
    if (!user.avatarUrl) return user;
    return { ...user, avatarUrl: await this.s3.presignGet(user.avatarUrl) };
  }

  async create(dto: CreateUserDto, userId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        department: dto.department,
        phone: dto.phone,
      },
      select: publicSelect,
    });
    await this.audit.log({
      userId,
      entityType: 'User',
      entityId: user.id,
      action: AuditAction.CREATE,
      after: { email: user.email, role: user.role },
    });
    return this.withAvatar(user);
  }

  async findAll(query: ListUsersDto) {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: publicSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: await Promise.all(data.map((u) => this.withAvatar(u))),
      pagination: paginationMeta(total, query.page, query.limit),
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return this.withAvatar(user);
  }

  async update(id: string, dto: UpdateUserDto, userId: string) {
    const existing = await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: publicSelect,
    });
    await this.audit.log({
      userId,
      entityType: 'User',
      entityId: id,
      action: AuditAction.UPDATE,
      before: { email: existing.email, role: existing.role },
      after: { email: user.email, role: user.role },
    });
    return this.withAvatar(user);
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    await this.findOne(id);
    const password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.update({
      where: { id },
      data: { password },
      select: publicSelect,
    });
    return this.withAvatar(user);
  }

  async remove(id: string, userId: string) {
    const existing = await this.findOne(id);
    try {
      await this.prisma.user.delete({ where: { id } });
      await this.audit.log({
        userId,
        entityType: 'User',
        entityId: id,
        action: AuditAction.DELETE,
        before: { email: existing.email, role: existing.role },
      });
      return { id };
    } catch (err) {
      // Foreign-key conflicts (user referenced by created records) surface here.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new ConflictException(
          'This user has linked records and cannot be deleted; deactivate them instead.',
        );
      }
      throw err;
    }
  }
}
