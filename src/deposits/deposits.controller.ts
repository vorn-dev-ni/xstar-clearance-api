import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DepositsService } from './deposits.service';

@ApiTags('deposits')
@ApiBearerAuth()
@Controller('deposits')
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  create(@Body() dto: CreateDepositDto, @CurrentUser() user: AuthUser) {
    return this.deposits.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.deposits.findAll(query);
  }
}
