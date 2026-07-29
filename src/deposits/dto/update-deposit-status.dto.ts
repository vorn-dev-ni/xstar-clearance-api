import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContainerDepositStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';

export class UpdateDepositStatusDto {
  @ApiProperty({ enum: ContainerDepositStatus })
  @IsEnum(ContainerDepositStatus)
  status!: ContainerDepositStatus;

  @ApiPropertyOptional({
    description:
      'Refund request date, captured when moving to AWAITING_DEPOSIT_REFUND (defaults to today).',
  })
  @IsOptional()
  @IsISO8601()
  refundRequestDate?: string;

  @ApiPropertyOptional({
    description: 'Remark captured at the AWAITING_DEPOSIT_REFUND step.',
  })
  @IsOptional()
  @IsString()
  remark?: string;
}
