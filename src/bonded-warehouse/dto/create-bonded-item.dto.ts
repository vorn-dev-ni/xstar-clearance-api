import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BondedDutyStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * One bonded-warehouse stock item (a single physical unit). Mirrors the
 * client's "Stock Detail" sheet columns. Almost everything is optional so
 * partially-known rows (and Excel imports) can be saved.
 */
export class CreateBondedItemDto {
  @ApiPropertyOptional({ description: 'Link to a clearance/BL job' })
  @IsOptional()
  @IsString()
  clearanceJobId?: string;

  @ApiProperty({ example: 'SITDNBSVE900699', description: 'B/L / AWB number' })
  @IsString()
  blNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  importerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shipperName?: string;

  @ApiPropertyOptional({ description: 'Invoice / Packing List number' })
  @IsOptional()
  @IsString()
  invoicePackingNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  portOfLoading?: string;

  @ApiPropertyOptional({ description: 'Port of Discharge / Transit Place' })
  @IsOptional()
  @IsString()
  portOfDischarge?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  containerTruckNumber?: string;

  @ApiPropertyOptional({ example: '40HC' })
  @IsOptional()
  @IsString()
  containerTruckType?: string;

  @ApiPropertyOptional({ example: 'TOYOTA BZ5' })
  @IsOptional()
  @IsString()
  brandName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '200KW' })
  @IsOptional()
  @IsString()
  engineCapacity?: string;

  @ApiPropertyOptional({ example: 2025 })
  @IsOptional()
  @IsInt()
  modelYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 'CHINA' })
  @IsOptional()
  @IsString()
  countryOrigin?: string;

  @ApiPropertyOptional({ example: 'LFMCF14V8S0004756' })
  @IsOptional()
  @IsString()
  vin?: string;

  @ApiPropertyOptional({ example: 'B125000296' })
  @IsOptional()
  @IsString()
  engineNumber?: string;

  @ApiPropertyOptional({ example: '87038098' })
  @IsOptional()
  @IsString()
  commodityCode?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Gross weight (KGS)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  grossWeightKg?: number;

  @ApiPropertyOptional({
    example: '2025-12-31',
    description: 'Received in KWB',
  })
  @IsOptional()
  @IsISO8601()
  receivedDateKwb?: string;

  @ApiPropertyOptional({ description: 'ID of the WarehouseLocation' })
  @IsString()
  @IsOptional()
  currentLocationId?: string;

  @ApiPropertyOptional({ enum: BondedDutyStatus, default: 'UNPAID' })
  @IsOptional()
  @IsEnum(BondedDutyStatus)
  dutyStatus?: BondedDutyStatus;

  @ApiPropertyOptional({
    example: 180,
    description: 'Duty suspension valid days',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  validDays?: number;

  @ApiPropertyOptional({ example: '2025-12-28' })
  @IsOptional()
  @IsISO8601()
  etaDate?: string;

  @ApiPropertyOptional({ description: 'SAD ID (IM8) — transit declaration' })
  @IsOptional()
  @IsString()
  sadIdIm8?: string;

  @ApiPropertyOptional({ example: '2025-12-30' })
  @IsOptional()
  @IsISO8601()
  transitDate?: string;

  @ApiPropertyOptional({ description: 'SAD ID (IM7) — inbound declaration' })
  @IsOptional()
  @IsString()
  sadIdIm7?: string;

  @ApiPropertyOptional({ example: '2025-12-31' })
  @IsOptional()
  @IsISO8601()
  inboundDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
