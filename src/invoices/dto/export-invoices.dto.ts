import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ExportFormat } from '../../reports/dto/report-query.dto';
import { ListInvoicesDto } from './list-invoices.dto';

export class ExportInvoicesDto extends ListInvoicesDto {
  @ApiPropertyOptional({ enum: ExportFormat, default: ExportFormat.PDF })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat;
}
