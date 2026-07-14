import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';

@Module({
  imports: [JournalModule],
  controllers: [DepositsController],
  providers: [DepositsService],
})
export class DepositsModule {}
