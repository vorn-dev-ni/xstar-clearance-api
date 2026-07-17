import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

/**
 * An income line on a B/L costing sheet (Excel "收入" columns). Persisted as an
 * unposted IncomeRecord; total income = Σ amount.
 */
export class CreateIncomeLineDto {
  @ApiProperty({ example: '2026-05-30' })
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional({
    description: 'Received-from account name (收到账户名称)',
  })
  @IsOptional()
  @IsString()
  receivedFromName?: string;

  @ApiPropertyOptional({ description: 'Invoice / CM # (发票/收据编号)' })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiProperty({ description: 'Description / payment from (明细描述/付款方)' })
  @IsString()
  description!: string;

  @ApiProperty({ example: 289.06, description: 'Amount (金额)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ description: 'Remark (备注)' })
  @IsOptional()
  @IsString()
  notes?: string;
}
