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
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { ListServiceTypesDto } from './dto/list-service-types.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import { ServiceTypesService } from './service-types.service';

@ApiTags('service-types')
@ApiBearerAuth()
@RequirePermission('accounting.view')
@Controller('service-types')
export class ServiceTypesController {
  constructor(private readonly serviceTypes: ServiceTypesService) {}

  @Post()
  @RequirePermission('accounting.edit')
  create(@Body() dto: CreateServiceTypeDto) {
    return this.serviceTypes.create(dto);
  }

  @Get()
  findAll(@Query() query: ListServiceTypesDto) {
    return this.serviceTypes.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.serviceTypes.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('accounting.edit')
  update(@Param('id') id: string, @Body() dto: UpdateServiceTypeDto) {
    return this.serviceTypes.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('accounting.edit')
  remove(@Param('id') id: string) {
    return this.serviceTypes.remove(id);
  }
}
