import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WarehouseLocationsController } from './warehouse-locations.controller';
import { WarehouseLocationsService } from './warehouse-locations.service';

@Module({
  imports: [PrismaModule],
  controllers: [WarehouseLocationsController],
  providers: [WarehouseLocationsService],
  exports: [WarehouseLocationsService],
})
export class WarehouseLocationsModule {}
