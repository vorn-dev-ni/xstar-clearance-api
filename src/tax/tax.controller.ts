import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTaxFilingDto } from './dto/create-tax-filing.dto';
import { TaxService } from './tax.service';

@ApiTags('tax-filings')
@ApiBearerAuth()
@Controller('tax-filings')
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  create(@Body() dto: CreateTaxFilingDto) {
    return this.tax.create(dto);
  }

  @Get()
  findAll() {
    return this.tax.findAll();
  }

  @Post(':id/submit')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  submit(@Param('id') id: string) {
    return this.tax.submit(id);
  }
}
