import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateDepositDto {
  @ApiProperty({ example: '2026-02-01' })
  @IsISO8601()
  depositDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({
    description: 'Shipment file (Bill) this deposit belongs to',
  })
  @IsOptional()
  @IsString()
  clearanceJobId?: string;

  @ApiProperty({ example: 1800.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ example: 'Operations Deposit' })
  @IsString()
  purpose!: string;

  @ApiProperty({ description: 'Account id the deposit is booked against' })
  @IsString()
  accountId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
