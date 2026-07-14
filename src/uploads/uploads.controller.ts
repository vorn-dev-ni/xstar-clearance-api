import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { ListUploadsDto } from './dto/list-uploads.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { UploadsService } from './uploads.service';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

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

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.uploads.remove(id, user.userId);
  }
}
