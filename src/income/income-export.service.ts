import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { listPeriodLabel } from '../common/export-period';
import { ReportExportService } from '../reports/report-export.service';
import { humanizeEnum } from '../reports/report-document';
import type { ListIncomeDto } from './dto/list-income.dto';

type IncomeRow = Prisma.IncomeRecordGetPayload<{
  include: { customer: { select: { id: true; nameEn: true } } };
}>;

export interface IncomeListSummary {
  totalIncome: number;
  recordCount: number;
}

@Injectable()
export class IncomeExportService {
  constructor(private readonly exporter: ReportExportService) {}

  async export(
    rows: IncomeRow[],
    summary: IncomeListSummary,
    query: ListIncomeDto,
    format: 'PDF' | 'EXCEL',
  ): Promise<Buffer> {
    const document = await this.exporter.buildListDocument({
      title: 'Income Records (Money In)',
      periodLabel: listPeriodLabel(query),
      columns: [
        { header: 'Record #', key: 'recordNumber', width: 15 },
        { header: 'Date', key: 'recordDate', width: 12 },
        { header: 'Customer', key: 'customer', width: 28 },
        { header: 'Service Type', key: 'serviceType', width: 20 },
        { header: 'Description', key: 'description', width: 36 },
        { header: 'Status', key: 'status', width: 11 },
        {
          header: 'Amount',
          key: 'amount',
          width: 14,
          align: 'right',
          format: 'currency',
        },
      ],
      rows: rows.map((r) => ({
        recordNumber: r.recordNumber,
        recordDate: r.recordDate.toISOString().slice(0, 10),
        customer: r.customer?.nameEn ?? '',
        serviceType: humanizeEnum(r.serviceType),
        description: r.description,
        status: humanizeEnum(r.status),
        amount: Number(r.amount),
      })),
      totalRow: {
        customer: `TOTAL (${summary.recordCount} records)`,
        amount: summary.totalIncome,
      },
    });
    return format === 'EXCEL'
      ? this.exporter.toExcel(document)
      : this.exporter.toPdf(document);
  }
}
