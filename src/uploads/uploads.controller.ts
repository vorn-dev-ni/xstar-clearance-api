import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { CreateUploadDto } from './dto/create-upload.dto';
import { ListUploadsDto } from './dto/list-uploads.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { UpdateUploadDto } from './dto/update-upload.dto';
import { MAX_UPLOAD_BYTES, UploadsService, type UploadedFileLike } from './uploads.service';

@ApiTags('uploads')
@ApiBearerAuth()
@RequirePermission('documents.view')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * Proxied upload: the browser POSTs the file here and the API streams it to
   * S3 server-side. Avoids any browser→S3 CORS dependency.
   */
  @Post()
  @RequirePermission('documents.edit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  create(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() dto: CreateUploadDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    return this.uploads.create(file, dto, user.userId);
  }

  @Post('presign')
  @RequirePermission('documents.edit')
  presign(@Body() dto: PresignUploadDto, @CurrentUser() user: AuthUser) {
    return this.uploads.presign(dto, user.userId);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @RequirePermission('documents.edit')
  confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmUploadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.uploads.confirm(id, dto, user.userId);
  }

  @Get(':id/url')
  getUrl(@Param('id') id: string) {
    return this.uploads.getDownloadUrl(id);
  }

  @Get()
  findAll(@Query() query: ListUploadsDto) {
    return this.uploads.findAll(query);
  }

  @Patch(':id')
  @RequirePermission('documents.edit')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUploadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.uploads.updateMeta(id, dto, user.userId);
  }

  @Delete(':id')
  @RequirePermission('documents.action')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.uploads.remove(id, user.userId);
  }
}
