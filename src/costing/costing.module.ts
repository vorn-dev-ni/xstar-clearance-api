import { Module } from '@nestjs/common';
import { DepositsModule } from '../deposits/deposits.module';
import { ExpenseModule } from '../expense/expense.module';
import { IncomeModule } from '../income/income.module';
import { CostingController } from './costing.controller';
import { CostingService } from './costing.service';

@Module({
  imports: [ExpenseModule, IncomeModule, DepositsModule],
  controllers: [CostingController],
  providers: [CostingService],
})
export class CostingModule {}
