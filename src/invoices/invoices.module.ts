import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { InvoiceExportService } from './invoice-export.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [JournalModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceExportService],
})
export class InvoicesModule {}
