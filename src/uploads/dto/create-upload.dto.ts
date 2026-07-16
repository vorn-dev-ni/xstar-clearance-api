import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Multipart fields that accompany the uploaded `file` on `POST /uploads`.
 * The bytes are sent as the `file` part; these describe what the file attaches to.
 */
export class CreateUploadDto {
  @ApiPropertyOptional({
    example: 'ClearanceJob',
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
