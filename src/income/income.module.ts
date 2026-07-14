import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { IncomeController } from './income.controller';
import { IncomeService } from './income.service';

@Module({
  imports: [JournalModule],
  controllers: [IncomeController],
  providers: [IncomeService],
})
export class IncomeModule {}
