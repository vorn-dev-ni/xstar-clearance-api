import { Module } from '@nestjs/common';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';

@Module({
  controllers: [JournalController],
  providers: [JournalService],
  // Exported so income/expense/invoice modules can post journals via postJournal.
  exports: [JournalService],
})
export class JournalModule {}
