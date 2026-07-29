import { ApiPropertyOptional } from '@nestjs/swagger';
import { ClearanceType, JobStatus, ShipmentType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListClearanceJobsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ enum: JobStatus })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @ApiPropertyOptional({ enum: ClearanceType })
  @IsOptional()
  @IsEnum(ClearanceType)
  clearanceType?: ClearanceType;

  @ApiPropertyOptional({ enum: ShipmentType })
  @IsOptional()
  @IsEnum(ShipmentType)
  shipmentType?: ShipmentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shipmentStatus?: string;

  @ApiPropertyOptional({
    description: 'Search by job number or BL/booking number',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
