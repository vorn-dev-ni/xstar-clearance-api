import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ExportFormat } from '../../reports/dto/report-query.dto';
import { ListExpensesDto } from './list-expenses.dto';

export class ExportExpensesDto extends ListExpensesDto {
  @ApiPropertyOptional({ enum: ExportFormat, default: ExportFormat.PDF })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat;
}
