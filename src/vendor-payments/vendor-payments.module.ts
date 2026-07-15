import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { VendorPaymentsController } from './vendor-payments.controller';
import { VendorPaymentsService } from './vendor-payments.service';

@Module({
  imports: [JournalModule],
  controllers: [VendorPaymentsController],
  providers: [VendorPaymentsService],
})
export class VendorPaymentsModule {}
