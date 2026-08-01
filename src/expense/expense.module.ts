import { Module } from '@nestjs/common';
import { DepositsModule } from '../deposits/deposits.module';
import { JournalModule } from '../journal/journal.module';
import { ReportsModule } from '../reports/reports.module';
import { ExpenseController } from './expense.controller';
import { ExpenseExportService } from './expense-export.service';
import { ExpenseVoucherService } from './expense-voucher.service';
import { ExpenseService } from './expense.service';

@Module({
  imports: [JournalModule, ReportsModule, DepositsModule],
  controllers: [ExpenseController],
  providers: [ExpenseService, ExpenseExportService, ExpenseVoucherService],
  exports: [ExpenseService],
})
export class ExpenseModule {}
