import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import type { AuthUser } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Enforces `@Roles(...)`. Runs after JwtAuthGuard, so `req.user` is populated.
 * Routes without `@Roles` are allowed for any authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException(
        "User doesn't have permission for this action",
      );
    }
    return true;
  }
}
