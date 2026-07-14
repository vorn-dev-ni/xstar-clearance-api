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
import { ApproveExpenseDto, RejectExpenseDto } from './dto/approval.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseService } from './expense.service';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expense: ExpenseService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.STAFF)
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser) {
    return this.expense.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListExpensesDto) {
    return this.expense.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.expense.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.STAFF)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expense.update(id, dto, user.userId);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expense.approve(id, user.userId, dto.notes);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expense.reject(id, user.userId, dto.rejectionReason);
  }
}
