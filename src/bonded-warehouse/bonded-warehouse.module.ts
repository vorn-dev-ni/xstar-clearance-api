import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { BondedSummaryExportService } from './bonded-summary-export.service';
import { BondedWarehouseExcelService } from './bonded-warehouse-excel.service';
import { BondedWarehouseController } from './bonded-warehouse.controller';
import { BondedWarehouseService } from './bonded-warehouse.service';

@Module({
  imports: [ReportsModule],
  controllers: [BondedWarehouseController],
  providers: [
    BondedWarehouseService,
    BondedWarehouseExcelService,
    BondedSummaryExportService,
  ],
  exports: [BondedWarehouseService],
})
export class BondedWarehouseModule {}
