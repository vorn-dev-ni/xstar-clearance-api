import { Module } from '@nestjs/common';
import { OperationsModule } from '../operations/operations.module';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';

@Module({
  imports: [OperationsModule],
  controllers: [DealsController],
  providers: [DealsService],
})
export class DealsModule {}
