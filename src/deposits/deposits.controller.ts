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
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { UpdateDepositStatusDto } from './dto/update-deposit-status.dto';
import { DepositsService } from './deposits.service';

@ApiTags('deposits')
@ApiBearerAuth()
@RequirePermission('accounting.view')
@Controller('deposits')
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @Post()
  @RequirePermission('accounting.edit')
  create(@Body() dto: CreateDepositDto, @CurrentUser() user: AuthUser) {
    return this.deposits.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.deposits.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.deposits.findOne(id);
  }

  @Patch(':id/status')
  @RequirePermission('accounting.action')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDepositStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.deposits.updateStatus(id, dto.status, user.userId);
  }
}
