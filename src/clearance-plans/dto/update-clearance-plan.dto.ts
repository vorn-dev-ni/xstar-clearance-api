import { PartialType } from '@nestjs/swagger';
import { CreateClearancePlanDto } from './create-clearance-plan.dto';

export class UpdateClearancePlanDto extends PartialType(
  CreateClearancePlanDto,
) {}
