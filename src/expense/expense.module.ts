import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { ReportsModule } from '../reports/reports.module';
import { ExpenseController } from './expense.controller';
import { ExpenseExportService } from './expense-export.service';
import { ExpenseService } from './expense.service';

@Module({
  imports: [JournalModule, ReportsModule],
  controllers: [ExpenseController],
  providers: [ExpenseService, ExpenseExportService],
  exports: [ExpenseService],
})
export class ExpenseModule {}
