import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ExportFormat } from '../reports/dto/report-query.dto';
import { CreateClearancePlanDto } from './dto/create-clearance-plan.dto';
import { ExportClearancePlansDto } from './dto/export-clearance-plans.dto';
import { ListClearancePlansDto } from './dto/list-clearance-plans.dto';
import { UpdateClearancePlanDto } from './dto/update-clearance-plan.dto';
import { UpdateClearancePlanStatusDto } from './dto/update-clearance-plan-status.dto';
import { ClearancePlansExportService } from './clearance-plans-export.service';
import { ClearancePlansService } from './clearance-plans.service';

@ApiTags('clearance-plans')
@ApiBearerAuth()
@RequirePermission('operation.view')
@Controller('clearance-plans')
export class ClearancePlansController {
  constructor(
    private readonly plans: ClearancePlansService,
    private readonly exporter: ClearancePlansExportService,
  ) {}

  @Post()
  @RequirePermission('operation.edit')
  create(@Body() dto: CreateClearancePlanDto, @CurrentUser() user: AuthUser) {
    return this.plans.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListClearancePlansDto) {
    return this.plans.findAll(query);
  }

  // Declared before ':id' so '/clearance-plans/export' isn't routed to findOne.
  @Get('export')
  async export(
    @Query() query: ExportClearancePlansDto,
    @Res() res: Response,
  ): Promise<void> {
    const rows = await this.plans.findAllForExport(query);
    const format = query.format ?? ExportFormat.PDF;
    const buffer = await this.exporter.export(rows, format);
    if (format === ExportFormat.EXCEL) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="clearance-plans.xlsx"',
      );
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="clearance-plans.pdf"',
      );
    }
    res.send(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.plans.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('operation.edit')
  update(@Param('id') id: string, @Body() dto: UpdateClearancePlanDto) {
    return this.plans.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermission('operation.action')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClearancePlanStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.plans.updateStatus(id, dto.status, user.userId);
  }

  @Delete(':id')
  @RequirePermission('operation.edit')
  remove(@Param('id') id: string) {
    return this.plans.remove(id);
  }
}
