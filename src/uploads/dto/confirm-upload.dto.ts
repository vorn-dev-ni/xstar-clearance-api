import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ConfirmUploadDto {
  @ApiPropertyOptional({ description: 'Byte size of the uploaded file' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  size?: number;
}
