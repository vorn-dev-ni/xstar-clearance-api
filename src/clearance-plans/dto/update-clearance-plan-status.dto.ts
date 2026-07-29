import { ApiProperty } from '@nestjs/swagger';
import { ClearancePlanStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateClearancePlanStatusDto {
  @ApiProperty({ enum: ClearancePlanStatus })
  @IsEnum(ClearancePlanStatus)
  status!: ClearancePlanStatus;
}
