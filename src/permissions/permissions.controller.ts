import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { MODULES } from './permission.catalog';
import { PermissionsService } from './permissions.service';
import { RequirePermission } from './require-permission.decorator';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';

/**
 * Role → permission matrix administration. Gated by `roles.manage`, a key no
 * stored role holds — so only SUPER_ADMIN (which bypasses) can reach it.
 */
@ApiTags('permissions')
@ApiBearerAuth()
@RequirePermission('roles.manage')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  /** The module/capability catalog used to render the matrix UI. */
  @Get('catalog')
  catalog() {
    return { modules: MODULES };
  }

  /** Current grants per editable role (SUPER_ADMIN excluded — it is fixed). */
  @Get('roles')
  matrix() {
    return this.permissions.matrix();
  }

  @Put('roles/:role')
  setRole(@Param('role') role: UserRole, @Body() dto: SetRolePermissionsDto) {
    return this.permissions
      .setRolePermissions(role, dto.permissions)
      .then(() => this.permissions.matrix());
  }
}
