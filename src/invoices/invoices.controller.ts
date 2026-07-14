import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
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
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ExportInvoicesDto } from './dto/export-invoices.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { InvoiceExportService } from './invoice-export.service';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly exporter: InvoiceExportService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoices.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListInvoicesDto) {
    return this.invoices.findAll(query);
  }

  @Get('export')
  async export(
    @Query() query: ExportInvoicesDto,
    @Res() res: Response,
  ): Promise<void> {
    const { rows, summary } = await this.invoices.findAllForExport(query);
    const format = query.format ?? ExportFormat.PDF;

    if (format === ExportFormat.EXCEL) {
      const buffer = await this.exporter.listToExcel(rows, summary);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="invoices.xlsx"',
      );
      res.send(buffer);
      return;
    }

    const buffer = await this.exporter.listToPdf(rows, summary);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices.pdf"');
    res.send(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoices.findOne(id);
  }

  @Get(':id/pdf')
  async invoicePdf(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, invoiceNumber } = await this.exporter.invoicePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoiceNumber}.pdf"`,
    );
    res.send(buffer);
  }

  @Post(':id/finalize')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  finalize(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.invoices.finalize(id, user.userId);
  }

  @Post(':id/payments')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.recordPayment(id, dto, user.userId);
  }
}
