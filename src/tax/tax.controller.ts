import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { CreateTaxFilingDto } from './dto/create-tax-filing.dto';
import { TaxService } from './tax.service';

@ApiTags('tax-filings')
@ApiBearerAuth()
@RequirePermission('accounting.view')
@Controller('tax-filings')
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Post()
  @RequirePermission('accounting.edit')
  create(@Body() dto: CreateTaxFilingDto) {
    return this.tax.create(dto);
  }

  @Get()
  findAll() {
    return this.tax.findAll();
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('accounting.action')
  submit(@Param('id') id: string) {
    return this.tax.submit(id);
  }
}
