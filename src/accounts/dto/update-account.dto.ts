import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateAccountDto } from './create-account.dto';

/**
 * Editable account fields. All of `CreateAccountDto` is editable (including `code`
 * and `type`) plus `isActive`. `balance` is never accepted from the client — it is
 * derived from posted journal entries. When `type` changes, the service recomputes
 * the stored balance from the account's posted lines so the natural-sign direction
 * stays consistent with the ledger drill-down.
 */
export class UpdateAccountDto extends PartialType(CreateAccountDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
