import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { ClearancePlansController } from './clearance-plans.controller';
import { ClearancePlansExportService } from './clearance-plans-export.service';
import { ClearancePlansService } from './clearance-plans.service';

@Module({
  imports: [PrismaModule, ReportsModule],
  controllers: [ClearancePlansController],
  providers: [ClearancePlansService, ClearancePlansExportService],
  exports: [ClearancePlansService],
})
export class ClearancePlansModule {}
