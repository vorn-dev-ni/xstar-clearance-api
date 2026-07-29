import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ExportFormat } from '../../reports/dto/report-query.dto';
import { ListClearancePlansDto } from './list-clearance-plans.dto';

export class ExportClearancePlansDto extends ListClearancePlansDto {
  @ApiPropertyOptional({ enum: ExportFormat, default: ExportFormat.PDF })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat;
}
