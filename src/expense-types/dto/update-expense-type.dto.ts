import { PartialType } from '@nestjs/swagger';
import { CreateExpenseTypeDto } from './create-expense-type.dto';

export class UpdateExpenseTypeDto extends PartialType(CreateExpenseTypeDto) {}
