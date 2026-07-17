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
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { CreateClearanceJobDto } from './dto/create-clearance-job.dto';
import { ListClearanceJobsDto } from './dto/list-clearance-jobs.dto';
import { UpdateClearanceJobDto } from './dto/update-clearance-job.dto';
import { OperationsService } from './operations.service';

@ApiTags('operations')
@ApiBearerAuth()
@RequirePermission('operation.view')
@Controller('clearance-jobs')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Post()
  @RequirePermission('operation.edit')
  create(@Body() dto: CreateClearanceJobDto, @CurrentUser() user: AuthUser) {
    return this.operations.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListClearanceJobsDto) {
    return this.operations.findAll(query);
  }

  // Must be declared before `:id` so Nest doesn't treat it as an id.
  @Get('next-number')
  nextNumber(@Query('transaction') transaction?: string) {
    return this.operations.nextNumber(transaction);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.operations.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('operation.edit')
  update(@Param('id') id: string, @Body() dto: UpdateClearanceJobDto) {
    return this.operations.update(id, dto);
  }
}
