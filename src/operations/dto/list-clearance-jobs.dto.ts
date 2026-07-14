import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListClearanceJobsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

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
