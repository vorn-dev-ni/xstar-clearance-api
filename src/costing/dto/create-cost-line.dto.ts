import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

/**
 * A cost line on a B/L costing sheet (Excel "成本" columns). Persisted as an
 * unposted ExpenseRecord; actualCost = amount + tax − deposit is derived.
 */
export class CreateCostLineDto {
  @ApiProperty({ example: '2026-05-30' })
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional({ description: 'Payee name / entity (收款名称)' })
  @IsOptional()
  @IsString()
  payeeName?: string;

  @ApiPropertyOptional({ description: 'Invoice / CM # (发票/收据编号)' })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiProperty({ description: 'Description (明细描述)' })
  @IsString()
  description!: string;

  @ApiProperty({ example: 545, description: 'Amount (金额)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ example: 0, description: 'Tax amount (税费)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  tax?: number;

  @ApiPropertyOptional({
    example: 0,
    description: 'Deposit / refundable (押金)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  deposit?: number;

  @ApiPropertyOptional({ description: 'Remark (备注)' })
  @IsOptional()
  @IsString()
  notes?: string;
}
