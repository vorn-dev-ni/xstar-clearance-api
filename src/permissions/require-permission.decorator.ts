import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Restricts a route to holders of a `${module}.${capability}` permission
 * (enforced by PermissionsGuard). Routes without it are open to any
 * authenticated user.
 */
export const RequirePermission = (permission: string) =>
  SetMetadata(PERMISSION_KEY, permission);
