import { Module } from '@nestjs/common';
import { ExpenseModule } from '../expense/expense.module';
import { IncomeModule } from '../income/income.module';
import { CostingController } from './costing.controller';
import { CostingService } from './costing.service';

@Module({
  imports: [ExpenseModule, IncomeModule],
  controllers: [CostingController],
  providers: [CostingService],
})
export class CostingModule {}
