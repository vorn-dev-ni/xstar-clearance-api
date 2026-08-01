import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReportExportService } from '../reports/report-export.service';

type PlanRow = Prisma.ClearancePlanGetPayload<{
  include: {
    clearanceJob: { select: { jobNumber: true; blBookingNumber: true } };
  };
}>;

@Injectable()
export class ClearancePlansExportService {
  constructor(private readonly exporter: ReportExportService) {}

  async export(rows: PlanRow[], format: 'PDF' | 'EXCEL'): Promise<Buffer> {
    const document = await this.exporter.buildListDocument({
      title: 'CLEARANCE PLANS',
      periodLabel: `Generated ${new Date().toISOString().slice(0, 10)}`,
      landscape: true,
      columns: [
        { header: 'No.', key: 'no', width: 5, format: 'number' },
        { header: 'Consignee', key: 'consignee', width: 30 },
        { header: 'Container', key: 'container', width: 16 },
        { header: 'Size / Volume', key: 'size', width: 10 },
        { header: 'Type', key: 'containerType', width: 12 },
        { header: 'Seal', key: 'seal', width: 16 },
        { header: 'BL', key: 'bl', width: 20 },
        { header: 'Shipment (Job No.)', key: 'jobNo', width: 20 },
        { header: 'Commodity', key: 'commodity', width: 24 },
        { header: 'Port', key: 'port', width: 8 },
        { header: 'Clearance Date', key: 'clearanceDate', width: 14 },
      ],
      rows: rows.map((r, i) => ({
        no: i + 1,
        consignee: r.consignee ?? '',
        container: r.container,
        size: r.size ?? '',
        containerType: r.containerType ?? '',
        seal: r.seal ?? '',
        // The container's own B/L; fall back to the job's primary for legacy rows.
        bl: r.blNumber ?? r.clearanceJob?.blBookingNumber ?? '',
        jobNo: r.clearanceJob?.jobNumber ?? '',
        commodity: r.commodity ?? '',
        port: r.port ?? '',
        clearanceDate: r.clearanceDate
          ? r.clearanceDate.toISOString().slice(0, 10)
          : '',
      })),
    });
    return format === 'EXCEL'
      ? this.exporter.toExcel(document)
      : this.exporter.toPdf(document);
  }
}
