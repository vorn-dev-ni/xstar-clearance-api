import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReconciliationLineDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemNumber?: number;

  @ApiProperty({ example: 'Company Income February 2026' })
  @IsString()
  description!: string;

  // Money in/out may be negative (adjustments/reversals) — no @Min.
  @ApiPropertyOptional({
    example: 1200.5,
    description: 'Money in (may be negative)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  moneyIn?: number;

  @ApiPropertyOptional({
    example: 300,
    description: 'Money out (may be negative)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  moneyOut?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class CreateBankReconciliationDto {
  @ApiProperty({
    description: 'Bank account (chart-of-accounts entry, type BANK)',
  })
  @IsString()
  bankAccountId!: string;

  @ApiProperty({ example: '2026-02-01' })
  @IsISO8601()
  periodStart!: string;

  @ApiProperty({ example: '2026-02-28' })
  @IsISO8601()
  periodEnd!: string;

  @ApiProperty({ example: 57401.05 })
  @IsNumber({ maxDecimalPlaces: 2 })
  openingBalance!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [ReconciliationLineDto] })
  @ValidateNested({ each: true })
  @Type(() => ReconciliationLineDto)
  @ArrayMinSize(1)
  lines!: ReconciliationLineDto[];
}
