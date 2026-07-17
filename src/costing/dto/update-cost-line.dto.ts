import { PartialType } from '@nestjs/swagger';
import { CreateCostLineDto } from './create-cost-line.dto';

export class UpdateCostLineDto extends PartialType(CreateCostLineDto) {}
