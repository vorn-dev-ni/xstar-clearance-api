import { Module } from '@nestjs/common';
import { BondedWarehouseExcelService } from './bonded-warehouse-excel.service';
import { BondedWarehouseController } from './bonded-warehouse.controller';
import { BondedWarehouseService } from './bonded-warehouse.service';

@Module({
  controllers: [BondedWarehouseController],
  providers: [BondedWarehouseService, BondedWarehouseExcelService],
  exports: [BondedWarehouseService],
})
export class BondedWarehouseModule {}
