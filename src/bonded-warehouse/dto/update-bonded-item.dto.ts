import { PartialType } from '@nestjs/swagger';
import { CreateBondedItemDto } from './create-bonded-item.dto';

export class UpdateBondedItemDto extends PartialType(CreateBondedItemDto) {}
