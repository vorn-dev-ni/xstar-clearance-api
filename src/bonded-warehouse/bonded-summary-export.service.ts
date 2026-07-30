import { Injectable } from '@nestjs/common';
import { ReportExportService } from '../reports/report-export.service';
import { BondedWarehouseService } from './bonded-warehouse.service';

interface SummaryFilter {
  clearanceJobId?: string;
  blNumber?: string;
  blNumbers?: string;
}

/** Format a date as DD/MM/YYYY (the shared exporter only number-formats). */
function formatDate(d: Date | null): string {
  if (!d) return '';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

/**
 * "Stock Movement Summary" export (PDF + Excel) using the shared styled exporter,
 * mirroring the clearance-plans export. Columns match the client's spec exactly.
 */
@Injectable()
export class BondedSummaryExportService {
  constructor(
    private readonly exporter: ReportExportService,
    private readonly bonded: BondedWarehouseService,
  ) {}

  async export(filter: SummaryFilter, format: 'PDF' | 'EXCEL'): Promise<Buffer> {
    const rows = await this.bonded.summary(filter);
    const document = await this.exporter.buildListDocument({
      title: 'STOCK MOVEMENT SUMMARY',
      periodLabel: `Generated ${new Date().toISOString().slice(0, 10)}`,
      landscape: true,
      columns: [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'B/L No.', key: 'bl', width: 20 },
        { header: 'Invoice / Packing List Number', key: 'invoice', width: 22 },
        { header: 'Item Type / Description', key: 'itemType', width: 22 },
        { header: 'Total Quantity Received (Units)', key: 'totalReceived', width: 12, format: 'number' },
        { header: 'Quantity in Warehouse (Units)', key: 'inWarehouse', width: 12, format: 'number' },
        { header: 'Quantity in Showroom (Units)', key: 'inShowroom', width: 12, format: 'number' },
        { header: 'Quantity with Duty Paid (Units)', key: 'dutyPaid', width: 12, format: 'number' },
        { header: 'Quantity with Duty Unpaid (Units)', key: 'dutyUnpaid', width: 12, format: 'number' },
        { header: 'Number of Duty Suspension Days', key: 'suspensionDays', width: 12 },
      ],
      rows: rows.map((r) => ({
        date: formatDate(r.receivedDate),
        bl: r.blNumber,
        invoice: r.invoicePackingNumber ?? '',
        itemType: r.itemType ?? '',
        totalReceived: r.totalReceived,
        inWarehouse: r.qtyInKwb,
        inShowroom: r.qtyInShowroom,
        dutyPaid: r.qtyDutyPaid,
        dutyUnpaid: r.qtyDutyUnpaid,
        suspensionDays: r.closed ? 'Closed' : (r.dutySuspensionDays ?? ''),
      })),
    });
    return format === 'EXCEL'
      ? this.exporter.toExcel(document)
      : this.exporter.toPdf(document);
  }
}
