import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExpenseTypesController } from './expense-types.controller';
import { ExpenseTypesService } from './expense-types.service';

@Module({
  imports: [PrismaModule],
  controllers: [ExpenseTypesController],
  providers: [ExpenseTypesService],
  exports: [ExpenseTypesService],
})
export class ExpenseTypesModule {}
