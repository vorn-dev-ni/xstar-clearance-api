import { ApiPropertyOptional } from '@nestjs/swagger';
import { BondedDutyStatus } from '@prisma/client';
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

  @ApiPropertyOptional({ description: 'Filter by WarehouseLocation ID' })
  @IsOptional()
  @IsString()
  currentLocationId?: string;

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
