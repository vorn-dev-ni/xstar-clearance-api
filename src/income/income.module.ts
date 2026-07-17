import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { ReportsModule } from '../reports/reports.module';
import { IncomeController } from './income.controller';
import { IncomeExportService } from './income-export.service';
import { IncomeService } from './income.service';

@Module({
  imports: [JournalModule, ReportsModule],
  controllers: [IncomeController],
  providers: [IncomeService, IncomeExportService],
  exports: [IncomeService],
})
export class IncomeModule {}
