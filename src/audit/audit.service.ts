import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditContext {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}

interface LogParams extends AuditContext {
  entityType: string;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
}

/**
 * Writes immutable audit-trail rows. Financial services call `log` on every
 * mutating action (create/update/approve/reject/post) with a before/after diff.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: LogParams): Promise<void> {
    const changes =
      params.before !== undefined || params.after !== undefined
        ? JSON.stringify({ before: params.before, after: params.after })
        : undefined;

    await this.prisma.auditLog.create({
      data: {
        userId: params.userId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        changes,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  }

  async list(filters: {
    entityType?: string;
    action?: AuditAction;
    skip: number;
    take: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      entityType: filters.entityType,
      action: filters.action,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: filters.skip,
        take: filters.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { rows, total };
  }
}
