import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DealStatus, TransportMode } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDealDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiPropertyOptional({ enum: DealStatus, default: DealStatus.OPPORTUNITY })
  @IsOptional()
  @IsEnum(DealStatus)
  status?: DealStatus;

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

  @ApiPropertyOptional({ example: 'IMP', description: 'IMP / EXP' })
  @IsOptional()
  @IsString()
  shipmentType?: string;

  @ApiPropertyOptional({ enum: TransportMode })
  @IsOptional()
  @IsEnum(TransportMode)
  transportMode?: TransportMode;

  @ApiPropertyOptional({ description: 'Estimated revenue for the opportunity' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  estimatedRevenue?: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salespersonId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
