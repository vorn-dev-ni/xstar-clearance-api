import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCustomerDto {
  @ApiPropertyOptional({
    example: '027-01-26',
    description: 'Human-readable customer ID; auto-generated if omitted',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty()
  @IsString()
  nameEn!: string;

  @ApiProperty({ description: 'TIN (tax identification number)' })
  @IsString()
  taxId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameKh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameCn?: string;

  @ApiProperty()
  @IsString()
  address!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commune?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ default: 'Cambodia' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPerson?: string;

  @ApiPropertyOptional({ example: 'NET30' })
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Free-text location' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Manual patent / registration number' })
  @IsOptional()
  @IsString()
  patentNo?: string;

  @ApiPropertyOptional({
    example: '2027-07-14',
    description: 'Patent expiry date',
  })
  @IsOptional()
  @IsISO8601()
  patentExpiryDate?: string;

  @ApiProperty({
    example: '2026-07-14',
    description:
      'Date the client was registered in the system (contract may predate)',
  })
  @IsISO8601()
  registrationDate!: string;

  @ApiPropertyOptional({
    description: 'Editable anytime; required whenever isActive changes',
  })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representativeImageUrl?: string;
}
