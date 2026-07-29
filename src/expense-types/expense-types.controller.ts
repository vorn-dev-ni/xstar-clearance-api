import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { CreateExpenseTypeDto } from './dto/create-expense-type.dto';
import { ListExpenseTypesDto } from './dto/list-expense-types.dto';
import { UpdateExpenseTypeDto } from './dto/update-expense-type.dto';
import { ExpenseTypesService } from './expense-types.service';

@ApiTags('expense-types')
@ApiBearerAuth()
@RequirePermission('accounting.view')
@Controller('expense-types')
export class ExpenseTypesController {
  constructor(private readonly expenseTypes: ExpenseTypesService) {}

  @Post()
  @RequirePermission('accounting.edit')
  create(@Body() dto: CreateExpenseTypeDto) {
    return this.expenseTypes.create(dto);
  }

  @Get()
  findAll(@Query() query: ListExpenseTypesDto) {
    return this.expenseTypes.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.expenseTypes.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('accounting.edit')
  update(@Param('id') id: string, @Body() dto: UpdateExpenseTypeDto) {
    return this.expenseTypes.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('accounting.edit')
  remove(@Param('id') id: string) {
    return this.expenseTypes.remove(id);
  }
}
