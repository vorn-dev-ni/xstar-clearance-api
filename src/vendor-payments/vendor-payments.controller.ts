import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateVendorPaymentDto } from './dto/create-vendor-payment.dto';
import { ListVendorPaymentsDto } from './dto/list-vendor-payments.dto';
import { VendorPaymentsService } from './vendor-payments.service';

@ApiTags('vendor-payments')
@ApiBearerAuth()
@Controller('vendor-payments')
export class VendorPaymentsController {
  constructor(private readonly vendorPayments: VendorPaymentsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  create(@Body() dto: CreateVendorPaymentDto, @CurrentUser() user: AuthUser) {
    return this.vendorPayments.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListVendorPaymentsDto) {
    return this.vendorPayments.findAll(query);
  }
}
