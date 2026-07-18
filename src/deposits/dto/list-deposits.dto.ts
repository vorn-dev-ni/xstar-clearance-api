import { ApiPropertyOptional } from '@nestjs/swagger';
import { ContainerDepositStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListDepositsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ContainerDepositStatus })
  @IsOptional()
  @IsEnum(ContainerDepositStatus)
  status?: ContainerDepositStatus;

  @ApiPropertyOptional({ description: 'Only deposits for this customer' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Only deposits for this supplier' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Only deposits for this clearance job' })
  @IsOptional()
  @IsString()
  clearanceJobId?: string;

  @ApiPropertyOptional({ description: 'Match by deposit number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'depositDate >= (inclusive)',
  })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'depositDate <= (inclusive)',
  })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
