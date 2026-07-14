import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class PresignUploadDto {
  @ApiProperty({ example: 'invoice-ST26-000001.pdf' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @MaxLength(255)
  mimeType!: string;

  @ApiPropertyOptional({
    example: 'Invoice',
    description: 'Record type to attach to',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @ApiPropertyOptional({ description: 'Id of the record to attach to' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({
    enum: DocumentType,
    description: 'Shipping-document category (e.g. BILL_OF_LADING)',
  })
  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;
}
