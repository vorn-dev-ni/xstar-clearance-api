import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateClearanceJobDto {
  @ApiProperty({
    example: 'JOB-2026-001',
    description: 'Manual, unique job number',
  })
  @IsString()
  jobNumber!: string;

  @ApiProperty({ example: '2026-05-22' })
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional({ description: 'e.g. PASSED, IN PROGRESS' })
  @IsOptional()
  @IsString()
  shipmentStatus?: string;

  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sizeVolume?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiPropertyOptional({ example: '026F5222213' })
  @IsOptional()
  @IsString()
  blBookingNumber?: string;

  @ApiPropertyOptional({ description: 'Link to an income record' })
  @IsOptional()
  @IsString()
  incomeRecordId?: string;

  @ApiPropertyOptional({ example: 'HAND TOWEL, FACIAL TISSUE' })
  @IsOptional()
  @IsString()
  commodity?: string;

  @ApiPropertyOptional({ example: 'PPAP / SHV / TL' })
  @IsOptional()
  @IsString()
  portClearance?: string;

  @ApiPropertyOptional({ example: 'IMP' })
  @IsOptional()
  @IsString()
  transaction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notice?: string;

  @ApiPropertyOptional({ example: 'by mr.wei' })
  @IsOptional()
  @IsString()
  contacts?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  other?: string;
}
