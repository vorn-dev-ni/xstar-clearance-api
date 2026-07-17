import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BondedItemLocation, BondedMovementType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Records a stock movement on a bonded item (transfer / location update /
 * release). A RELEASE increments `releasedQty`; when `dutyPaid` it also flips
 * the item's duty status to PAID.
 */
export class CreateMovementDto {
  @ApiProperty({ enum: BondedMovementType })
  @IsEnum(BondedMovementType)
  type!: BondedMovementType;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({
    enum: BondedItemLocation,
    description: 'Destination location',
  })
  @IsOptional()
  @IsEnum(BondedItemLocation)
  toLocation?: BondedItemLocation;

  @ApiPropertyOptional({
    description: 'Released under duty payment (RELEASE only)',
  })
  @IsOptional()
  @IsBoolean()
  dutyPaid?: boolean;

  @ApiPropertyOptional({
    description: 'Customs declaration for the release (e.g. IM4)',
  })
  @IsOptional()
  @IsString()
  sadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
