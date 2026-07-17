import { ApiPropertyOptional } from '@nestjs/swagger';
import { BondedDutyStatus, BondedItemLocation } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListBondedItemsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by linked clearance job' })
  @IsOptional()
  @IsString()
  clearanceJobId?: string;

  @ApiPropertyOptional({ description: 'Filter by exact B/L number' })
  @IsOptional()
  @IsString()
  blNumber?: string;

  @ApiPropertyOptional({ enum: BondedItemLocation })
  @IsOptional()
  @IsEnum(BondedItemLocation)
  currentLocation?: BondedItemLocation;

  @ApiPropertyOptional({ enum: BondedDutyStatus })
  @IsOptional()
  @IsEnum(BondedDutyStatus)
  dutyStatus?: BondedDutyStatus;

  @ApiPropertyOptional({
    description: 'Search by B/L, VIN, engine #, brand or invoice/packing #',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
