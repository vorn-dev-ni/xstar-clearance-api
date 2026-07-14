import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { listPeriodLabel } from '../common/export-period';
import { ReportExportService } from '../reports/report-export.service';
import { humanizeEnum } from '../reports/report-document';
import type { ListExpensesDto } from './dto/list-expenses.dto';

type ExpenseRow = Prisma.ExpenseRecordGetPayload<{
  include: { supplier: { select: { id: true; nameEn: true } } };
}>;

export interface ExpenseListSummary {
  totalExpenses: number;
  recordCount: number;
}

@Injectable()
export class ExpenseExportService {
  constructor(private readonly exporter: ReportExportService) {}

  async export(
    rows: ExpenseRow[],
    summary: ExpenseListSummary,
    query: ListExpensesDto,
    format: 'PDF' | 'EXCEL',
  ): Promise<Buffer> {
    const document = await this.exporter.buildListDocument({
      title: 'Expense Records (Money Out)',
      periodLabel: listPeriodLabel(query),
      columns: [
        { header: 'Record #', key: 'recordNumber', width: 15 },
        { header: 'Date', key: 'recordDate', width: 12 },
        { header: 'Supplier', key: 'supplier', width: 26 },
        { header: 'Expense Type', key: 'expenseType', width: 22 },
        { header: 'Description', key: 'description', width: 34 },
        { header: 'Status', key: 'status', width: 11 },
        { header: 'Approval', key: 'approvalStatus', width: 13 },
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
        supplier: r.supplier?.nameEn ?? r.supplierName ?? '',
        expenseType: humanizeEnum(r.expenseType),
        description: r.description,
        status: humanizeEnum(r.status),
        approvalStatus: humanizeEnum(r.approvalStatus),
        amount: Number(r.amount),
      })),
      totalRow: {
        supplier: `TOTAL (${summary.recordCount} records)`,
        amount: summary.totalExpenses,
      },
    });
    return format === 'EXCEL'
      ? this.exporter.toExcel(document)
      : this.exporter.toPdf(document);
  }
}
