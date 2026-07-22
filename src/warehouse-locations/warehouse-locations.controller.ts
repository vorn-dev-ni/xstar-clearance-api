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
import { CreateWarehouseLocationDto } from './dto/create-warehouse-location.dto';
import { ListWarehouseLocationsDto } from './dto/list-warehouse-locations.dto';
import { UpdateWarehouseLocationDto } from './dto/update-warehouse-location.dto';
import { WarehouseLocationsService } from './warehouse-locations.service';

@ApiTags('warehouse-locations')
@ApiBearerAuth()
@RequirePermission('operation.view')
@Controller('warehouse-locations')
export class WarehouseLocationsController {
  constructor(private readonly warehouseLocations: WarehouseLocationsService) {}

  @Post()
  @RequirePermission('operation.edit')
  create(@Body() dto: CreateWarehouseLocationDto) {
    return this.warehouseLocations.create(dto);
  }

  @Get()
  findAll(@Query() query: ListWarehouseLocationsDto) {
    return this.warehouseLocations.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.warehouseLocations.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('operation.edit')
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseLocationDto) {
    return this.warehouseLocations.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('operation.edit')
  remove(@Param('id') id: string) {
    return this.warehouseLocations.remove(id);
  }
}
