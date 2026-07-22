import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { ListSuppliersDto } from './dto/list-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('suppliers')
@ApiBearerAuth()
@RequirePermission('operation.view')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  @RequirePermission('operation.edit')
  create(@Body() dto: CreateSupplierDto, @CurrentUser() user: AuthUser) {
    return this.suppliers.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListSuppliersDto) {
    return this.suppliers.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.suppliers.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('operation.edit')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.suppliers.update(id, dto, user.userId);
  }

  @Delete(':id')
  @RequirePermission('operation.edit')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.suppliers.remove(id, user.userId);
  }
}
