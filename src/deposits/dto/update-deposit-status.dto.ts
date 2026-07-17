import { ApiProperty } from '@nestjs/swagger';
import { ContainerDepositStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateDepositStatusDto {
  @ApiProperty({ enum: ContainerDepositStatus })
  @IsEnum(ContainerDepositStatus)
  status!: ContainerDepositStatus;
}
