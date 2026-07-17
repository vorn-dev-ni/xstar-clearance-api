import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** List B/Ls (clearance jobs) with cost/income/profit roll-ups. */
export class ListCostingDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by B/L number or job number' })
  @IsOptional()
  @IsString()
  search?: string;
}
