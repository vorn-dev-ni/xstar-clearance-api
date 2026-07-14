import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  BalanceSheetQueryDto,
  ExportFormat,
  ExportQueryDto,
  PeriodQueryDto,
  TrendQueryDto,
} from './dto/report-query.dto';
import { ReportExportService } from './report-export.service';
import { ReportsService } from './reports.service';

const REPORT_TITLES: Record<string, string> = {
  'profit-loss': 'Profit & Loss Statement',
  'balance-sheet': 'Balance Sheet',
  'income-summary': 'Income Summary',
  'expense-summary': 'Expense Summary',
  aging: 'A/R Aging Analysis',
  'tax-summary': 'Tax Summary',
};

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exporter: ReportExportService,
  ) {}

  @Get('profit-loss')
  profitLoss(@Query() q: PeriodQueryDto) {
    return this.reports.profitLoss(q.month, q.year);
  }

  @Get('balance-sheet')
  balanceSheet(@Query() q: BalanceSheetQueryDto) {
    return this.reports.balanceSheet(q.date);
  }

  @Get('income-summary')
  incomeSummary(@Query() q: PeriodQueryDto) {
    return this.reports.incomeSummary(q.month, q.year);
  }

  @Get('expense-summary')
  expenseSummary(@Query() q: PeriodQueryDto) {
    return this.reports.expenseSummary(q.month, q.year);
  }

  @Get('aging')
  aging() {
    return this.reports.aging();
  }

  @Get('tax-summary')
  taxSummary(@Query() q: PeriodQueryDto) {
    return this.reports.taxSummary(q.month, q.year);
  }

  @Get('monthly-trend')
  monthlyTrend(@Query() q: TrendQueryDto) {
    return this.reports.monthlyTrend(q.year ?? new Date().getFullYear());
  }

  @Get(':report/export')
  async export(
    @Param('report') report: string,
    @Query() q: ExportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const title = REPORT_TITLES[report];
    if (!title) {
      throw new BadRequestException(`Unknown report: ${report}`);
    }

    const data = await this.buildReport(report, q);
    const document = await this.exporter.buildDocument(report, data);
    const format = q.format ?? ExportFormat.PDF;
    const safeName = title.replace(/[^a-z0-9]+/gi, '_');

    if (format === ExportFormat.EXCEL) {
      const buffer = await this.exporter.toExcel(document);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeName}.xlsx"`,
      );
      res.send(buffer);
      return;
    }

    const buffer = await this.exporter.toPdf(document);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}.pdf"`,
    );
    res.send(buffer);
  }

  private buildReport(report: string, q: ExportQueryDto): Promise<unknown> {
    switch (report) {
      case 'profit-loss':
        return this.reports.profitLoss(q.month, q.year);
      case 'balance-sheet':
        return this.reports.balanceSheet(q.date);
      case 'income-summary':
        return this.reports.incomeSummary(q.month, q.year);
      case 'expense-summary':
        return this.reports.expenseSummary(q.month, q.year);
      case 'aging':
        return this.reports.aging();
      case 'tax-summary':
        return this.reports.taxSummary(q.month, q.year);
      default:
        throw new BadRequestException(`Unknown report: ${report}`);
    }
  }
}
