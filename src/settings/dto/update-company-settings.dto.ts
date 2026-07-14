import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Editable subset of the single CompanySettings row. */
export class UpdateCompanySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyNameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    description: 'Default VAT percentage for new invoices',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  defaultVatRate?: number;

  @ApiPropertyOptional({ description: 'Default payment terms in days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultPaymentTerms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logo?: string;
}
