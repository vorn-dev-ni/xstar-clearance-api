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
import { UserRole } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { CreateUploadDto } from './dto/create-upload.dto';
import { ListUploadsDto } from './dto/list-uploads.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { UpdateUploadDto } from './dto/update-upload.dto';
import { MAX_UPLOAD_BYTES, UploadsService, type UploadedFileLike } from './uploads.service';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * Proxied upload: the browser POSTs the file here and the API streams it to
   * S3 server-side. Avoids any browser→S3 CORS dependency.
   */
  @Post()
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
  presign(@Body() dto: PresignUploadDto, @CurrentUser() user: AuthUser) {
    return this.uploads.presign(dto, user.userId);
  }

  @Post(':id/confirm')
  @HttpCode(200)
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
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUploadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.uploads.updateMeta(id, dto, user.userId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.uploads.remove(id, user.userId);
  }
}
