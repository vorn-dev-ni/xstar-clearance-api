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
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { CostingService } from './costing.service';
import { CreateCostLineDto } from './dto/create-cost-line.dto';
import { CreateIncomeLineDto } from './dto/create-income-line.dto';
import { ListCostingDto } from './dto/list-costing.dto';
import { UpdateCostLineDto } from './dto/update-cost-line.dto';
import { UpdateIncomeLineDto } from './dto/update-income-line.dto';

@ApiTags('costing')
@ApiBearerAuth()
@RequirePermission('accounting.view')
@Controller('costing')
export class CostingController {
  constructor(private readonly costing: CostingService) {}

  /** List B/Ls with cost/income/profit roll-ups. */
  @Get()
  list(@Query() query: ListCostingDto) {
    return this.costing.listBls(query);
  }

  /** The cost · income · profit statement for one B/L (clearance job). */
  @Get(':jobId')
  statement(@Param('jobId') jobId: string) {
    return this.costing.getStatement(jobId);
  }

  // ---- Cost lines --------------------------------------------------------

  @Post(':jobId/cost-lines')
  @RequirePermission('accounting.edit')
  addCostLine(
    @Param('jobId') jobId: string,
    @Body() dto: CreateCostLineDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.costing.addCostLine(jobId, dto, user.userId);
  }

  @Patch('cost-lines/:id')
  @RequirePermission('accounting.edit')
  updateCostLine(
    @Param('id') id: string,
    @Body() dto: UpdateCostLineDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.costing.updateCostLine(id, dto, user.userId);
  }

  @Delete('cost-lines/:id')
  @RequirePermission('accounting.edit')
  deleteCostLine(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.costing.deleteCostLine(id, user.userId);
  }

  // ---- Income lines ------------------------------------------------------

  @Post(':jobId/income-lines')
  @RequirePermission('accounting.edit')
  addIncomeLine(
    @Param('jobId') jobId: string,
    @Body() dto: CreateIncomeLineDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.costing.addIncomeLine(jobId, dto, user.userId);
  }

  @Patch('income-lines/:id')
  @RequirePermission('accounting.edit')
  updateIncomeLine(
    @Param('id') id: string,
    @Body() dto: UpdateIncomeLineDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.costing.updateIncomeLine(id, dto, user.userId);
  }

  @Delete('income-lines/:id')
  @RequirePermission('accounting.edit')
  deleteIncomeLine(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.costing.deleteIncomeLine(id, user.userId);
  }
}
