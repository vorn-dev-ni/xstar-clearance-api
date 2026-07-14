import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApproveExpenseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectExpenseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
