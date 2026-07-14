import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { CreateIncomeDto } from './dto/create-income.dto';
import { ListIncomeDto } from './dto/list-income.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';
import { IncomeService } from './income.service';

@ApiTags('income')
@ApiBearerAuth()
@Controller('income')
export class IncomeController {
  constructor(private readonly income: IncomeService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.STAFF)
  create(@Body() dto: CreateIncomeDto, @CurrentUser() user: AuthUser) {
    return this.income.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListIncomeDto) {
    return this.income.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.income.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.STAFF)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIncomeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.income.update(id, dto, user.userId);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.income.approve(id, user.userId);
  }
}
