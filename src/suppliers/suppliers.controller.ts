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
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { ListSuppliersDto } from './dto/list-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGER)
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
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
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(id, dto);
  }
}
