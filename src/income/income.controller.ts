import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ExportFormat } from '../reports/dto/report-query.dto';
import { CreateIncomeDto } from './dto/create-income.dto';
import { ExportIncomeDto } from './dto/export-income.dto';
import { ListIncomeDto } from './dto/list-income.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';
import { IncomeExportService } from './income-export.service';
import { IncomeService } from './income.service';

@ApiTags('income')
@ApiBearerAuth()
@Controller('income')
export class IncomeController {
  constructor(
    private readonly income: IncomeService,
    private readonly exporter: IncomeExportService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.STAFF)
  create(@Body() dto: CreateIncomeDto, @CurrentUser() user: AuthUser) {
    return this.income.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListIncomeDto) {
    return this.income.findAll(query);
  }

  // Must be declared before ':id' or Nest routes '/income/export' to findOne.
  @Get('export')
  async export(
    @Query() query: ExportIncomeDto,
    @Res() res: Response,
  ): Promise<void> {
    const { rows, summary } = await this.income.findAllForExport(query);
    const format = query.format ?? ExportFormat.PDF;
    const buffer = await this.exporter.export(rows, summary, query, format);

    if (format === ExportFormat.EXCEL) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="income.xlsx"',
      );
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="income.pdf"');
    }
    res.send(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.income.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.STAFF)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIncomeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.income.update(id, dto, user.userId);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.income.approve(id, user.userId);
  }
}
