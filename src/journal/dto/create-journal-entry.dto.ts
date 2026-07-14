import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntryLineType, ReferenceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class JournalLineDto {
  @ApiProperty()
  @IsString()
  accountId!: string;

  @ApiProperty({ enum: EntryLineType })
  @IsEnum(EntryLineType)
  entryType!: EntryLineType;

  @ApiProperty({ example: 500.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateJournalEntryDto {
  @ApiProperty({ example: '2026-02-28' })
  @IsISO8601()
  entryDate!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiPropertyOptional({
    enum: ReferenceType,
    default: ReferenceType.MANUAL_ENTRY,
  })
  @IsOptional()
  @IsEnum(ReferenceType)
  referenceType?: ReferenceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  memo?: string;

  @ApiProperty({ type: [JournalLineDto] })
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  @ArrayMinSize(2)
  lines!: JournalLineDto[];
}
