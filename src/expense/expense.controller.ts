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
import { PayBillDto } from './dto/pay-bill.dto';
import { PayBillsDto } from './dto/pay-bills.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseExportService } from './expense-export.service';
import { ExpenseVoucherService } from './expense-voucher.service';
import { ExpenseService } from './expense.service';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('expenses')
@ApiBearerAuth()
@RequirePermission('accounting.view')
@Controller('expenses')
export class ExpenseController {
  constructor(
    private readonly expense: ExpenseService,
    private readonly exporter: ExpenseExportService,
    private readonly voucher: ExpenseVoucherService,
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

    // Excel → a Payment-Voucher workbook (one sheet per expense in range).
    if (format === ExportFormat.EXCEL) {
      const buffer = await this.voucher.vouchersWorkbook(rows);
      res.setHeader('Content-Type', XLSX_MIME);
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="Payment vouchers.xlsx"',
      );
      res.send(buffer);
      return;
    }

    // PDF → the flat expense register table.
    const buffer = await this.exporter.export(
      rows,
      summary,
      query,
      ExportFormat.PDF,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.pdf"');
    res.send(buffer);
  }

  // Single expense → its Payment Voucher xlsx. Before ':id' path routes.
  @Get(':id/voucher.xlsx')
  async voucherExcel(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, recordNumber } = await this.voucher.voucherExcel(id);
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${recordNumber}.xlsx"`,
    );
    res.send(buffer);
  }

  // Open payables for the Pay Bills checklist. Before ':id' path routes.
  @Get('payables')
  payables(@Query() query: ListExpensesDto) {
    return this.expense.openPayables(query);
  }

  @Post('pay-bills')
  @HttpCode(200)
  @RequirePermission('accounting.edit')
  payBills(@Body() dto: PayBillsDto, @CurrentUser() user: AuthUser) {
    return this.expense.payBills(dto, user.userId);
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
  @RequirePermission('accounting.edit')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expense.approve(id, user.userId, dto.notes);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('accounting.edit')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expense.reject(id, user.userId, dto.rejectionReason);
  }

  @Post(':id/pay')
  @HttpCode(200)
  @RequirePermission('accounting.edit')
  pay(
    @Param('id') id: string,
    @Body() dto: PayBillDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expense.payBill(id, dto, user.userId);
  }
}
