import { Module } from '@nestjs/common';
import { IncomeModule } from '../income/income.module';
import { JournalModule } from '../journal/journal.module';
import { InvoiceExportService } from './invoice-export.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [JournalModule, IncomeModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceExportService],
})
export class InvoicesModule {}
