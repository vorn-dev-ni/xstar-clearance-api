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
import { BankReconciliationExportService } from './bank-reconciliation-export.service';
import { BankReconciliationService } from './bank-reconciliation.service';
import { CreateBankReconciliationDto } from './dto/create-bank-reconciliation.dto';
import { ListBankReconciliationsDto } from './dto/list-bank-reconciliations.dto';
import { UpdateBankReconciliationDto } from './dto/update-bank-reconciliation.dto';

@ApiTags('bank-reconciliation')
@ApiBearerAuth()
@RequirePermission('accounting.view')
@Controller('bank-reconciliation')
export class BankReconciliationController {
  constructor(
    private readonly service: BankReconciliationService,
    private readonly exporter: BankReconciliationExportService,
  ) {}

  @Post()
  @RequirePermission('accounting.edit')
  create(
    @Body() dto: CreateBankReconciliationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListBankReconciliationsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/export')
  async export(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { buffer, statementNumber } = await this.exporter.exportExcel(id);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${statementNumber}.xlsx"`,
    );
    res.send(buffer);
  }

  @Patch(':id')
  @RequirePermission('accounting.edit')
  update(@Param('id') id: string, @Body() dto: UpdateBankReconciliationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('accounting.edit')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
