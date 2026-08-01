import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

/** One payment-voucher line item. */
export class ExpenseItemDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  itemNumber!: number;

  @ApiPropertyOptional({
    description: 'Legacy A/C code text (superseded by accountId)',
  })
  @IsOptional()
  @IsString()
  acCode?: string;

  @ApiPropertyOptional({ description: 'Expense account id this line debits' })
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiPropertyOptional({ example: '2025-08-27' })
  @IsOptional()
  @IsISO8601()
  itemDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ example: 132 })
  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;
}

export class CreateExpenseDto {
  @ApiProperty({ example: '2026-02-15' })
  @IsISO8601()
  recordDate!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty({ description: 'ExpenseType.code', example: 'OFFICE_SUPPLIES' })
  @IsString()
  @IsNotEmpty()
  expenseType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Free-text supplier if not in system' })
  @IsOptional()
  @IsString()
  supplierName?: string;

  @ApiPropertyOptional({ description: 'Clearance job this expense is for' })
  @IsOptional()
  @IsString()
  clearanceJobId?: string;

  @ApiPropertyOptional({
    description: 'Total; computed from items when items are provided',
    example: 30.8,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({
    type: [ExpenseItemDto],
    description: 'Voucher line items; total = sum of item amounts',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExpenseItemDto)
  items?: ExpenseItemDto[];

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    description:
      'Legacy header-level expense account; accounts now live per line item',
  })
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiPropertyOptional({
    description: 'Tax percentage; taxAmount is computed from it',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  taxRate?: number;

  @ApiPropertyOptional({
    description: 'Explicit tax amount (money); overrides taxRate when set',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  taxAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  deposit?: number;

  @ApiPropertyOptional({
    description:
      'Shipping line for the linked container deposit (used when deposit > 0)',
  })
  @IsOptional()
  @IsString()
  shippingLine?: string;

  @ApiPropertyOptional({
    description: 'Container count (VOL) for the linked container deposit',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  volume?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  actualCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  poNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  // --- Payment-voucher header fields ---

  @ApiPropertyOptional({ description: 'Voucher purpose line' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ description: 'Payee bank account number' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ description: 'Payee bank account name' })
  @IsOptional()
  @IsString()
  accountName?: string;

  @ApiPropertyOptional({ description: 'LESS: Cash Advance amount' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  cashAdvance?: number;

  @ApiPropertyOptional({ enum: ['CASH', 'CHEQUE'] })
  @IsOptional()
  @IsIn(['CASH', 'CHEQUE'])
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Voucher note line' })
  @IsOptional()
  @IsString()
  note?: string;
}
