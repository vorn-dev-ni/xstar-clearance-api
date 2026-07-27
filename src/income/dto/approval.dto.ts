import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RejectIncomeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
