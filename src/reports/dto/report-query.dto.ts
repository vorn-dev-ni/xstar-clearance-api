import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
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

/** Income Summary filters: period + customer, service type, and description search. */
export class IncomeSummaryQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'ServiceType.code' })
  @IsOptional()
  @IsString()
  serviceType?: string;

  @ApiPropertyOptional({
    description: 'Search record number, description or invoice',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

/** Expense Summary filters: period + supplier, expense type, and description search. */
export class ExpenseSummaryQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'ExpenseType.code' })
  @IsOptional()
  @IsString()
  expenseType?: string;

  @ApiPropertyOptional({
    description: 'Search record number, description, invoice or supplier',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

export class ExportQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({ enum: ExportFormat, default: ExportFormat.PDF })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat;

  /** As-of date for snapshot reports (balance sheet). */
  @ApiPropertyOptional({ example: '2026-02-28' })
  @IsOptional()
  @IsISO8601()
  date?: string;

  // Summary filters, forwarded so exports match the on-screen report. Each report
  // reads only the fields it understands.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expenseType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class TrendQueryDto {
  @ApiPropertyOptional({ description: 'Defaults to the current year.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;
}

export class BalanceSheetQueryDto {
  @ApiPropertyOptional({ example: '2026-02-28' })
  @IsOptional()
  @IsISO8601()
  date?: string;
}
