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
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ExportFormat } from '../reports/dto/report-query.dto';
import { ApproveExpenseDto, RejectExpenseDto } from './dto/approval.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExportExpensesDto } from './dto/export-expenses.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseExportService } from './expense-export.service';
import { ExpenseService } from './expense.service';

@ApiTags('expenses')
@ApiBearerAuth()
@RequirePermission('accounting.view')
@Controller('expenses')
export class ExpenseController {
  constructor(
    private readonly expense: ExpenseService,
    private readonly exporter: ExpenseExportService,
  ) {}

  @Post()
  @RequirePermission('accounting.edit')
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser) {
    return this.expense.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListExpensesDto) {
    return this.expense.findAll(query);
  }

  // Must be declared before ':id' or Nest routes '/expenses/export' to findOne.
  @Get('export')
  async export(
    @Query() query: ExportExpensesDto,
    @Res() res: Response,
  ): Promise<void> {
    const { rows, summary } = await this.expense.findAllForExport(query);
    const format = query.format ?? ExportFormat.PDF;
    const buffer = await this.exporter.export(rows, summary, query, format);

    if (format === ExportFormat.EXCEL) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="expenses.xlsx"',
      );
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="expenses.pdf"',
      );
    }
    res.send(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.expense.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('accounting.edit')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expense.update(id, dto, user.userId);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('accounting.action')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expense.approve(id, user.userId, dto.notes);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('accounting.action')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expense.reject(id, user.userId, dto.rejectionReason);
  }
}
