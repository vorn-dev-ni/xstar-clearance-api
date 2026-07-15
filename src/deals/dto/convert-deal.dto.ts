import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';

/** Options when converting a won deal into a clearance job. */
export class ConvertDealDto {
  @ApiPropertyOptional({
    example: '2026-07-15',
    description: 'Job date; defaults to today when omitted',
  })
  @IsOptional()
  @IsISO8601()
  date?: string;

  @ApiPropertyOptional({
    description: 'Manual job number; auto-generated when omitted',
  })
  @IsOptional()
  @IsString()
  jobNumber?: string;

  @ApiPropertyOptional({ description: 'Operator/staff to assign to the job' })
  @IsOptional()
  @IsString()
  assignedStaffId?: string;
}
