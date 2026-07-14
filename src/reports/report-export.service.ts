import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { buildReportDocument } from './report-builders';
import {
  formatValue,
  type ReportColumnSpec,
  type ReportDocument,
  type ReportRowSpec,
  type ValueFormat,
} from './report-document';

const NAVY = '#112E81';
const PAGE_LEFT = 50;
const PAGE_RIGHT = 545;
const VALUE_COL_X = 415;
const VALUE_COL_W = PAGE_RIGHT - VALUE_COL_X;

@Injectable()
export class ReportExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Build a presentation document for a report slug from raw report data. */
  async buildDocument(slug: string, data: unknown): Promise<ReportDocument> {
    const company = await this.prisma.companySettings.findFirst({
      select: { companyNameEn: true, currency: true },
    });
    return {
      companyName:
        company?.companyNameEn ??
        'S.T STAR Logistics & Customs Clearance Service Co., Ltd',
      currency: company?.currency ?? 'USD',
      ...buildReportDocument(slug, data),
    };
  }

  /** Build a single-table document (list exports: income, expenses, …). */
  async buildListDocument(spec: {
    title: string;
    periodLabel: string;
    columns: ReportColumnSpec[];
    rows: Record<string, unknown>[];
    totalRow?: Record<string, unknown>;
  }): Promise<ReportDocument> {
    const company = await this.prisma.companySettings.findFirst({
      select: { companyNameEn: true, currency: true },
    });
    return {
      title: spec.title,
      companyName:
        company?.companyNameEn ??
        'S.T STAR Logistics & Customs Clearance Service Co., Ltd',
      currency: company?.currency ?? 'USD',
      periodLabel: spec.periodLabel,
      sections: [
        {
          kind: 'table',
          columns: spec.columns,
          rows: spec.rows,
          totalRow: spec.totalRow,
        },
      ],
    };
  }

  async toPdf(report: ReportDocument): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    doc.fontSize(16).fillColor('#000').text(report.companyName, PAGE_LEFT, 50);
    doc.moveDown(0.3);
    doc.fontSize(13).fillColor(NAVY).text(report.title);
    doc.fontSize(10).fillColor('#000').text(report.periodLabel);
    doc
      .fontSize(8)
      .fillColor('#666')
      .text(`Generated ${new Date().toISOString().slice(0, 10)}`);
    doc.moveDown(1.5);

    for (const section of report.sections) {
      this.ensureSpace(doc, 60);
      if (section.heading) this.pdfSectionHeading(doc, section.heading);
      if (section.kind === 'rows') {
        for (const row of section.rows) {
          this.pdfRow(doc, row, report.currency);
        }
        doc.moveDown(1);
      } else {
        this.pdfTable(
          doc,
          section.columns,
          section.rows,
          section.totalRow,
          report.currency,
        );
        doc.moveDown(1);
      }
    }

    doc.end();
    return done;
  }

  private ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
    if (doc.y + needed > 790) {
      doc.addPage();
      doc.y = 50;
    }
  }

  private pdfSectionHeading(doc: PDFKit.PDFDocument, heading: string): void {
    const y = doc.y;
    doc.rect(PAGE_LEFT, y - 3, PAGE_RIGHT - PAGE_LEFT, 17).fill(NAVY);
    doc
      .fontSize(10)
      .fillColor('#fff')
      .font('Helvetica-Bold')
      .text(heading, PAGE_LEFT + 6, y);
    doc.font('Helvetica').fillColor('#000');
    doc.y = y + 20;
  }

  private pdfRow(
    doc: PDFKit.PDFDocument,
    row: ReportRowSpec,
    currency: string,
  ): void {
    this.ensureSpace(doc, 20);
    const y = doc.y;
    if (row.bold) {
      doc
        .moveTo(PAGE_LEFT, y - 2)
        .lineTo(PAGE_RIGHT, y - 2)
        .strokeColor('#999')
        .stroke();
      doc.font('Helvetica-Bold');
    }
    const x = PAGE_LEFT + 6 + (row.indent ?? 0) * 14;
    doc.fontSize(10).fillColor('#000');
    doc.text(row.label, x, y + 1, { width: VALUE_COL_X - x - 10 });
    doc.text(formatValue(row.value, row.format, currency), VALUE_COL_X, y + 1, {
      width: VALUE_COL_W,
      align: 'right',
    });
    doc.font('Helvetica');
    doc.y = y + 17;
  }

  private pdfTable(
    doc: PDFKit.PDFDocument,
    columns: ReportColumnSpec[],
    rows: Record<string, unknown>[],
    totalRow: Record<string, unknown> | undefined,
    currency: string,
  ): void {
    // Distribute the printable width proportionally to Excel widths.
    const totalWidth = PAGE_RIGHT - PAGE_LEFT;
    const weight = columns.reduce((acc, c) => acc + (c.width ?? 15), 0);
    const widths = columns.map((c) => ((c.width ?? 15) / weight) * totalWidth);
    const xs = widths.reduce<number[]>(
      (acc, w, i) => [...acc, acc[i] + w],
      [PAGE_LEFT],
    );

    const header = (): void => {
      const y = doc.y;
      doc.rect(PAGE_LEFT, y - 3, totalWidth, 17).fill(NAVY);
      doc.fontSize(8).fillColor('#fff').font('Helvetica-Bold');
      columns.forEach((c, i) => {
        doc.text(c.header, xs[i] + 4, y + 1, {
          width: widths[i] - 8,
          align: c.align ?? 'left',
        });
      });
      doc.font('Helvetica').fillColor('#000');
      doc.y = y + 20;
    };

    const cell = (value: unknown, format: ValueFormat | undefined): string =>
      value === undefined || value === null
        ? ''
        : formatValue(value as string | number, format, currency);

    header();
    for (const row of rows) {
      if (doc.y > 760) {
        doc.addPage();
        doc.y = 50;
        header();
      }
      const y = doc.y;
      doc.fontSize(8).fillColor('#000');
      columns.forEach((c, i) => {
        doc.text(cell(row[c.key], c.format), xs[i] + 4, y, {
          width: widths[i] - 8,
          height: 10,
          ellipsis: true,
          align: c.align ?? 'left',
        });
      });
      doc.y = y + 14;
    }

    if (totalRow) {
      const y = doc.y;
      doc
        .moveTo(PAGE_LEFT, y - 2)
        .lineTo(PAGE_RIGHT, y - 2)
        .strokeColor('#999')
        .stroke();
      doc.fontSize(8).font('Helvetica-Bold');
      columns.forEach((c, i) => {
        doc.text(cell(totalRow[c.key], c.format), xs[i] + 4, y + 2, {
          width: widths[i] - 8,
          align: c.align ?? 'left',
        });
      });
      doc.font('Helvetica');
      doc.y = y + 18;
    }
  }

  async toExcel(report: ReportDocument): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    // Excel forbids * ? : \ / [ ] in sheet names and caps them at 31 chars.
    const sheetName = report.title.replace(/[*?:\\/[\]]/g, '-').slice(0, 31);
    const sheet = workbook.addWorksheet(sheetName);
    sheet.getColumn(1).width = 45;
    sheet.getColumn(2).width = 20;

    sheet.addRow([report.companyName]).font = { bold: true, size: 14 };
    sheet.addRow([report.title]).font = { bold: true, size: 12 };
    sheet.addRow([report.periodLabel]);
    sheet.addRow([`Currency: ${report.currency}`]).font = {
      size: 9,
      color: { argb: 'FF666666' },
    };
    sheet.addRow([]);

    for (const section of report.sections) {
      if (section.kind === 'rows') {
        this.excelHeading(sheet, section.heading, 2);
        for (const row of section.rows) {
          const r = sheet.addRow([
            `${'    '.repeat(row.indent ?? 0)}${row.label}`,
            row.value,
          ]);
          r.getCell(2).numFmt = this.numFmt(row.format, row.value);
          if (row.bold) {
            r.font = { bold: true };
            r.getCell(1).border = { top: { style: 'thin' } };
            r.getCell(2).border = { top: { style: 'thin' } };
          }
        }
        sheet.addRow([]);
      } else {
        this.excelHeading(sheet, section.heading, section.columns.length);
        const headerRow = sheet.addRow(section.columns.map((c) => c.header));
        headerRow.font = { bold: true };
        section.columns.forEach((c, i) => {
          const col = sheet.getColumn(i + 1);
          if (c.width && (col.width ?? 0) < c.width) col.width = c.width;
          if (c.align === 'right') {
            headerRow.getCell(i + 1).alignment = { horizontal: 'right' };
          }
        });
        for (const row of section.rows) {
          const r = sheet.addRow(section.columns.map((c) => row[c.key] ?? ''));
          section.columns.forEach((c, i) => {
            r.getCell(i + 1).numFmt = this.numFmt(c.format, row[c.key]);
          });
        }
        if (section.totalRow) {
          const total = section.totalRow;
          const r = sheet.addRow(
            section.columns.map((c) => total[c.key] ?? ''),
          );
          r.font = { bold: true };
          section.columns.forEach((c, i) => {
            r.getCell(i + 1).numFmt = this.numFmt(c.format, total[c.key]);
            r.getCell(i + 1).border = { top: { style: 'thin' } };
          });
        }
        sheet.addRow([]);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private excelHeading(
    sheet: ExcelJS.Worksheet,
    heading: string | undefined,
    span: number,
  ): void {
    if (!heading) return;
    const row = sheet.addRow([heading]);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    for (let i = 1; i <= span; i++) {
      row.getCell(i).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF112E81' },
      };
    }
  }

  private numFmt(format: ValueFormat | undefined, value: unknown): string {
    if (typeof value !== 'number') return '@';
    switch (format ?? 'currency') {
      case 'currency':
        return '#,##0.00';
      case 'percent':
        return '0.0"%"';
      case 'number':
        return '#,##0';
      default:
        return '@';
    }
  }
}
