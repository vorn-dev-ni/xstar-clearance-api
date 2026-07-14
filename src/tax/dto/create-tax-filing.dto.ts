import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaxFilingType } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateTaxFilingDto {
  @ApiProperty({ enum: TaxFilingType })
  @IsEnum(TaxFilingType)
  filingType!: TaxFilingType;

  @ApiProperty({ example: '2026-02', description: 'YYYY-MM' })
  @Matches(/^\d{4}-\d{2}$/, { message: 'filingPeriod must be YYYY-MM' })
  filingPeriod!: string;

  @ApiProperty({ example: 31618.49 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxableIncome!: number;

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxRate!: number;

  @ApiProperty({ example: 3161.85 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
