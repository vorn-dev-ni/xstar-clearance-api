import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateIncomeDto {
  @ApiProperty({ example: '2026-02-26' })
  @IsISO8601()
  recordDate!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty({
    description: 'ServiceType.code',
    example: 'CUSTOMS_CLEARANCE',
  })
  @IsString()
  @IsNotEmpty()
  serviceType!: string;

  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiPropertyOptional({ description: 'Clearance job this revenue is for' })
  @IsOptional()
  @IsString()
  clearanceJobId?: string;

  @ApiProperty({ example: 289.06 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiProperty({ description: 'Revenue account id to credit' })
  @IsString()
  accountId!: string;

  @ApiPropertyOptional({ description: 'userId of the staff who received it' })
  @IsOptional()
  @IsString()
  receivedFrom?: string;

  @ApiPropertyOptional({ description: 'Free-text payer / account name' })
  @IsOptional()
  @IsString()
  receivedFromName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  balance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  containerCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}
