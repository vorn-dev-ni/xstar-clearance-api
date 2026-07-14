import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus, TransportMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
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

export class BillRecordItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  itemNumber!: number;

  @ApiProperty({ example: 'HAND TOWEL 40x70' })
  @IsString()
  description!: string;

  @ApiProperty({ example: 120 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity!: number;

  @ApiProperty({ example: 2.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}

export class BillExpenseItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  itemNumber!: number;

  @ApiProperty({ example: 'Port handling fee' })
  @IsString()
  description!: string;

  @ApiProperty({ example: 150 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;
}

export class CreateClearanceJobDto {
  @ApiPropertyOptional({
    example: 'IMP-2026-0001',
    description: 'Unique job number; auto-generated when omitted',
  })
  @IsOptional()
  @IsString()
  jobNumber?: string;

  @ApiProperty({ example: '2026-05-22' })
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional({ enum: JobStatus, description: 'Workflow status' })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @ApiPropertyOptional({ description: 'Legacy free-text status' })
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

  // Shipment details
  @ApiPropertyOptional({ example: 'China' })
  @IsOptional()
  @IsString()
  originCountry?: string;

  @ApiPropertyOptional({ example: 'Shanghai' })
  @IsOptional()
  @IsString()
  originPort?: string;

  @ApiPropertyOptional({ example: 'Cambodia' })
  @IsOptional()
  @IsString()
  destinationCountry?: string;

  @ApiPropertyOptional({ example: 'PPAP' })
  @IsOptional()
  @IsString()
  destinationPort?: string;

  @ApiPropertyOptional({ enum: TransportMode })
  @IsOptional()
  @IsEnum(TransportMode)
  transportMode?: TransportMode;

  @ApiPropertyOptional({ description: 'Shipper name / address / contact' })
  @IsOptional()
  @IsString()
  shipperDetails?: string;

  @ApiPropertyOptional({ description: 'Consignee name / address / contact' })
  @IsOptional()
  @IsString()
  consigneeDetails?: string;

  @ApiPropertyOptional({
    example: '2026-06-01',
    description: 'Expected arrival date',
  })
  @IsOptional()
  @IsISO8601()
  eta?: string;

  @ApiPropertyOptional({ description: 'Commercial invoice value of goods' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  goodsValue?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  goodsCurrency?: string;

  @ApiPropertyOptional({ example: 'CIF' })
  @IsOptional()
  @IsString()
  incoterms?: string;

  // Job costing
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  estimatedRevenue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  estimatedCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedStaff?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brokerName?: string;

  // Billing
  @ApiPropertyOptional({ example: '2026-07-20' })
  @IsOptional()
  @IsISO8601()
  issueClearanceDate?: string;

  @ApiPropertyOptional({ description: 'Agreed total incl. tax & expenses' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  totalAmount?: number;

  @ApiPropertyOptional({ description: 'Client prepayment' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  depositAmount?: number;

  @ApiPropertyOptional({ type: [BillRecordItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillRecordItemDto)
  recordItems?: BillRecordItemDto[];

  @ApiPropertyOptional({ type: [BillExpenseItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillExpenseItemDto)
  expenseItems?: BillExpenseItemDto[];
}
