import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export enum ExportFormat {
  PDF = 'PDF',
  EXCEL = 'EXCEL',
}

export class PeriodQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;
}

export class ExportQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({ enum: ExportFormat, default: ExportFormat.PDF })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat;
}

export class BalanceSheetQueryDto {
  @ApiPropertyOptional({ example: '2026-02-28' })
  @IsOptional()
  @IsISO8601()
  date?: string;
}
