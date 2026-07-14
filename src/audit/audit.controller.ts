import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { AuditService } from './audit.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGER)
  async findAll(@Query() query: ListAuditLogsDto) {
    const { skip, take } = toSkipTake(query.page, query.limit);
    const { rows, total } = await this.audit.list({
      entityType: query.entityType,
      action: query.action,
      skip,
      take,
    });
    const data = rows.map((r) => ({
      ...r,
      changes: r.changes ? (JSON.parse(r.changes) as unknown) : null,
    }));
    return { data, pagination: paginationMeta(total, query.page, query.limit) };
  }
}
