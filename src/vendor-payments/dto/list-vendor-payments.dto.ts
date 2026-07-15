import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListVendorPaymentsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only payments to this supplier' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Only payments for this clearance job' })
  @IsOptional()
  @IsString()
  clearanceJobId?: string;
}
