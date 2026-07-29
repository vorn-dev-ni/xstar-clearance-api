import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListClearancePlansDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search container / seal / commodity / consignee',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by linked Shipment (ClearanceJob) id',
  })
  @IsOptional()
  @IsString()
  clearanceJobId?: string;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
