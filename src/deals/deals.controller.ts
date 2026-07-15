import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ConvertDealDto } from './dto/convert-deal.dto';
import { CreateDealDto } from './dto/create-deal.dto';
import { ListDealsDto } from './dto/list-deals.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { DealsService } from './deals.service';

@ApiTags('deals')
@ApiBearerAuth()
@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGER)
  create(@Body() dto: CreateDealDto, @CurrentUser() user: AuthUser) {
    return this.deals.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListDealsDto) {
    return this.deals.findAll(query);
  }

  // Must be declared before `:id` so Nest doesn't treat it as an id.
  @Get('next-number')
  nextNumber() {
    return this.deals.nextNumber();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.deals.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateDealDto) {
    return this.deals.update(id, dto);
  }

  @Post(':id/convert')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGER)
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertDealDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.deals.convert(id, dto, user.userId);
  }
}
