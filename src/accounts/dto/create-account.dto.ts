import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountCategory, AccountType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({ example: '4001' })
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  nameEn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameKh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameCn?: string;

  @ApiProperty({ enum: AccountType })
  @IsEnum(AccountType)
  type!: AccountType;

  @ApiProperty({ enum: AccountCategory })
  @IsEnum(AccountCategory)
  category!: AccountCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
