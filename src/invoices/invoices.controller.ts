import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoices.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListInvoicesDto) {
    return this.invoices.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoices.findOne(id);
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
