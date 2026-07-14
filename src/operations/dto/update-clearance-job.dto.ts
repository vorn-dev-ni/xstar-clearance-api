import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateClearanceJobDto } from './create-clearance-job.dto';

export class UpdateClearanceJobDto extends PartialType(
  OmitType(CreateClearanceJobDto, ['jobNumber'] as const),
) {}
