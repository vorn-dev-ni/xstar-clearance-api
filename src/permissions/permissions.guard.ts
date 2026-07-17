import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { PERMISSION_KEY } from './require-permission.decorator';
import { PermissionsService } from './permissions.service';

/**
 * Enforces `@RequirePermission('module.capability')`. Runs after JwtAuthGuard so
 * `req.user` is populated. Routes without the decorator are allowed for any
 * authenticated user; SUPER_ADMIN passes everything (handled by the service).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user || !(await this.permissions.has(user.role, required))) {
      throw new ForbiddenException(
        "User doesn't have permission for this action",
      );
    }
    return true;
  }
}
