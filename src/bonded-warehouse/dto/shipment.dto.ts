import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BondedDutyStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateBondedItemDto } from './create-bonded-item.dto';

/**
 * Shipment-level fields shared by every stock item on the same B/L. Editing
 * these fans the change out to all items in the group.
 */
export class ShipmentHeaderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  importerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shipperName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoicePackingNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  portOfLoading?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  portOfDischarge?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  containerTruckNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  containerTruckType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commodityCode?: string;

  @ApiPropertyOptional({ example: 180 })
  @IsOptional()
  @IsInt()
  @Min(0)
  validDays?: number;

  @ApiPropertyOptional({ example: '2025-12-28' })
  @IsOptional()
  @IsISO8601()
  etaDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sadIdIm8?: string;

  @ApiPropertyOptional({ example: '2025-12-30' })
  @IsOptional()
  @IsISO8601()
  transitDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sadIdIm7?: string;

  @ApiPropertyOptional({
    example: '2025-12-31',
    description: 'Received/inbound date in KWB (shared by the shipment)',
  })
  @IsOptional()
  @IsISO8601()
  receivedDateKwb?: string;

  @ApiPropertyOptional({ example: '2025-12-31' })
  @IsOptional()
  @IsISO8601()
  inboundDate?: string;

  @ApiPropertyOptional({ example: '2026-01-15', description: 'Release / outbound date' })
  @IsOptional()
  @IsISO8601()
  outboundDate?: string;

  @ApiPropertyOptional({ description: 'WarehouseLocation id all items land in' })
  @IsOptional()
  @IsString()
  currentLocationId?: string;

  @ApiPropertyOptional({ enum: BondedDutyStatus })
  @IsOptional()
  @IsEnum(BondedDutyStatus)
  dutyStatus?: BondedDutyStatus;
}

/** Fan-out update: apply shared header fields to every item on a B/L group. */
export class UpdateShipmentDto {
  @ApiPropertyOptional({ description: 'Target group by clearance job' })
  @IsOptional()
  @IsString()
  clearanceJobId?: string;

  @ApiPropertyOptional({ description: 'Target group by B/L number' })
  @IsOptional()
  @IsString()
  blNumber?: string;

  @ApiProperty({ type: ShipmentHeaderDto })
  @ValidateNested()
  @Type(() => ShipmentHeaderDto)
  fields!: ShipmentHeaderDto;
}

/** Bulk create: one shipment header + its stock item rows, in one transaction. */
export class CreateShipmentDto {
  @ApiProperty({ example: 'SITDNBSVE900699', description: 'B/L / AWB number' })
  @IsString()
  blNumber!: string;

  @ApiPropertyOptional({ description: 'Link to a clearance/BL job' })
  @IsOptional()
  @IsString()
  clearanceJobId?: string;

  @ApiProperty({ type: ShipmentHeaderDto })
  @ValidateNested()
  @Type(() => ShipmentHeaderDto)
  header!: ShipmentHeaderDto;

  @ApiProperty({ type: [CreateBondedItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBondedItemDto)
  items!: CreateBondedItemDto[];
}
