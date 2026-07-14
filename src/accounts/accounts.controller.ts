import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { ListAccountsDto } from './dto/list-accounts.dto';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  create(@Body() dto: CreateAccountDto) {
    return this.accounts.create(dto);
  }

  @Get()
  findAll(@Query() query: ListAccountsDto) {
    return this.accounts.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accounts.findOne(id);
  }
}
