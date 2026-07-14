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
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateClearanceJobDto } from './dto/create-clearance-job.dto';
import { ListClearanceJobsDto } from './dto/list-clearance-jobs.dto';
import { UpdateClearanceJobDto } from './dto/update-clearance-job.dto';
import { OperationsService } from './operations.service';

@ApiTags('operations')
@ApiBearerAuth()
@Controller('clearance-jobs')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGER)
  create(@Body() dto: CreateClearanceJobDto, @CurrentUser() user: AuthUser) {
    return this.operations.create(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListClearanceJobsDto) {
    return this.operations.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.operations.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateClearanceJobDto) {
    return this.operations.update(id, dto);
  }
}
