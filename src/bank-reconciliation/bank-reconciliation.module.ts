import { Module } from '@nestjs/common';
import { BankReconciliationExportService } from './bank-reconciliation-export.service';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { BankReconciliationService } from './bank-reconciliation.service';

@Module({
  controllers: [BankReconciliationController],
  providers: [BankReconciliationService, BankReconciliationExportService],
  exports: [BankReconciliationService],
})
export class BankReconciliationModule {}
