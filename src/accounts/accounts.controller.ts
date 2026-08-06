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
import { RequirePermission } from '../permissions/require-permission.decorator';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { ListAccountsDto } from './dto/list-accounts.dto';
import { ListLedgerDto } from './dto/list-ledger.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@ApiTags('accounts')
@ApiBearerAuth()
@RequirePermission('accounting.view')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  @RequirePermission('accounting.edit')
  create(@Body() dto: CreateAccountDto) {
    return this.accounts.create(dto);
  }

  @Get()
  findAll(@Query() query: ListAccountsDto) {
    return this.accounts.findAll(query);
  }

  @Get(':id/ledger')
  ledger(@Param('id') id: string, @Query() query: ListLedgerDto) {
    return this.accounts.ledger(id, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accounts.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('accounting.edit')
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(id, dto);
  }
}
