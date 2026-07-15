import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class InvoiceLineItemDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemNumber!: number;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty({ example: 4 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity!: number;

  @ApiProperty({ example: 1200.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  unitPrice!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateInvoiceDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiPropertyOptional({
    description: 'Link this invoice to the clearance job it bills for',
  })
  @IsOptional()
  @IsString()
  clearanceJobId?: string;

  @ApiPropertyOptional({
    enum: InvoiceType,
    default: InvoiceType.TAX_INVOICE,
    description: 'DEBIT_NOTE carries no VAT and is not under company title',
  })
  @IsOptional()
  @IsEnum(InvoiceType)
  invoiceType?: InvoiceType;

  @ApiProperty({ example: '2026-05-22' })
  @IsISO8601()
  invoiceDate!: string;

  @ApiPropertyOptional({ example: '2026-06-21' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ default: 10, description: 'VAT percentage' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [InvoiceLineItemDto] })
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  @ArrayMinSize(1)
  lineItems!: InvoiceLineItemDto[];
}
