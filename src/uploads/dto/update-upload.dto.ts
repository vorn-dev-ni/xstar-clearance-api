import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateUploadDto {
  @ApiPropertyOptional({
    enum: DocumentType,
    description: 'Shipping-document category (e.g. BILL_OF_LADING)',
  })
  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;
}
