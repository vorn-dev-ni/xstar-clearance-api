import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { BondedWarehouseExcelService } from './bonded-warehouse-excel.service';
import { BondedWarehouseService } from './bonded-warehouse.service';
import { CreateBondedItemDto } from './dto/create-bonded-item.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { ListBondedItemsDto } from './dto/list-bonded-items.dto';
import { UpdateBondedItemDto } from './dto/update-bonded-item.dto';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024; // 10 MB

interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
}

@ApiTags('bonded-warehouse')
@ApiBearerAuth()
@RequirePermission('operation.view')
@Controller('bonded-warehouse')
export class BondedWarehouseController {
  constructor(
    private readonly bonded: BondedWarehouseService,
    private readonly excel: BondedWarehouseExcelService,
  ) {}

  @Post('items')
  @RequirePermission('operation.edit')
  create(@Body() dto: CreateBondedItemDto, @CurrentUser() user: AuthUser) {
    return this.bonded.create(dto, user.userId);
  }

  @Get('items')
  findAll(@Query() query: ListBondedItemsDto) {
    return this.bonded.findAll(query);
  }

  @Get('summary')
  summary(
    @Query('clearanceJobId') clearanceJobId?: string,
    @Query('blNumber') blNumber?: string,
  ) {
    return this.bonded.summary({ clearanceJobId, blNumber });
  }

  // Must precede ':id' so Nest doesn't treat 'export' as an id.
  @Get('export')
  async export(
    @Res() res: Response,
    @Query('clearanceJobId') clearanceJobId?: string,
    @Query('blNumber') blNumber?: string,
  ): Promise<void> {
    const buffer = await this.excel.export({ clearanceJobId, blNumber });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="bonded-warehouse.xlsx"',
    );
    res.send(buffer);
  }

  @Post('import')
  @RequirePermission('operation.edit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }),
  )
  import(
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() user: AuthUser,
    @Body('clearanceJobId') clearanceJobId?: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.excel.import(file.buffer, user.userId, clearanceJobId);
  }

  @Get('items/:id')
  findOne(@Param('id') id: string) {
    return this.bonded.findOne(id);
  }

  @Patch('items/:id')
  @RequirePermission('operation.edit')
  update(@Param('id') id: string, @Body() dto: UpdateBondedItemDto) {
    return this.bonded.update(id, dto);
  }

  @Delete('items/:id')
  @RequirePermission('operation.action')
  remove(@Param('id') id: string) {
    return this.bonded.remove(id);
  }

  @Post('items/:id/movements')
  @RequirePermission('operation.action')
  addMovement(
    @Param('id') id: string,
    @Body() dto: CreateMovementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bonded.addMovement(id, dto, user.userId);
  }
}
