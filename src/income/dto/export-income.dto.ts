import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ExportFormat } from '../../reports/dto/report-query.dto';
import { ListIncomeDto } from './list-income.dto';

export class ExportIncomeDto extends ListIncomeDto {
  @ApiPropertyOptional({ enum: ExportFormat, default: ExportFormat.PDF })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat;
}
