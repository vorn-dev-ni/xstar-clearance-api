import { PartialType } from '@nestjs/swagger';
import { CreateIncomeLineDto } from './create-income-line.dto';

export class UpdateIncomeLineDto extends PartialType(CreateIncomeLineDto) {}
