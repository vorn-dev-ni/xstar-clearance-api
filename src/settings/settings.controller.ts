import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
import { UpdateTaxRateDto } from './dto/update-tax-rate.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // ---- Tax rates -------------------------------------------------------

  @Get('tax-rates')
  listTaxRates() {
    return this.settings.listTaxRates();
  }

  @Post('tax-rates')
  @Roles(UserRole.ADMIN)
  createTaxRate(@Body() dto: CreateTaxRateDto) {
    return this.settings.createTaxRate(dto);
  }

  @Patch('tax-rates/:id')
  @Roles(UserRole.ADMIN)
  updateTaxRate(@Param('id') id: string, @Body() dto: UpdateTaxRateDto) {
    return this.settings.updateTaxRate(id, dto);
  }

  @Post('tax-rates/:id/default')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  setDefaultTaxRate(@Param('id') id: string) {
    return this.settings.setDefaultTaxRate(id);
  }

  @Delete('tax-rates/:id')
  @Roles(UserRole.ADMIN)
  removeTaxRate(@Param('id') id: string) {
    return this.settings.removeTaxRate(id);
  }

  // ---- Company settings ------------------------------------------------

  @Get('settings/company')
  getCompanySettings() {
    return this.settings.getCompanySettings();
  }

  @Patch('settings/company')
  @Roles(UserRole.ADMIN)
  updateCompanySettings(@Body() dto: UpdateCompanySettingsDto) {
    return this.settings.updateCompanySettings(dto);
  }
}
