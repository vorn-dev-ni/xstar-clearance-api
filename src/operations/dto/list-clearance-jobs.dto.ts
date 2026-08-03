import { ApiPropertyOptional } from '@nestjs/swagger';
import { ClearanceType, JobStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
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

  @ApiPropertyOptional({
    description:
      'Filter by whether the shipment already has a clearance plan. ' +
      '`false` returns only shipments without one.',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasClearancePlan?: boolean;
}
