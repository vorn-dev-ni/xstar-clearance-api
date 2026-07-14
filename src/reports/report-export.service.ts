import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export interface ReportRow {
  label: string;
  value: string;
}

@Injectable()
export class ReportExportService {
  /** Flatten an arbitrary report object into indented label/value rows. */
  flatten(obj: unknown, prefix = ''): ReportRow[] {
    const rows: ReportRow[] = [];
    if (obj === null || typeof obj !== 'object') {
      return [{ label: prefix || 'value', value: String(obj) }];
    }
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const label = prefix ? `${prefix} · ${key}` : key;
      if (val !== null && typeof val === 'object') {
        rows.push(...this.flatten(val, label));
      } else {
        rows.push({ label, value: String(val) });
      }
    }
    return rows;
  }

  async toPdf(title: string, rows: ReportRow[]): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const done = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    doc.fontSize(18).text('S.T STAR Logistics & Customs Clearance');
    doc.moveDown(0.3);
    doc.fontSize(14).text(title);
    doc.moveDown(0.2);
    doc
      .fontSize(9)
      .fillColor('#666')
      .text(`Generated ${new Date().toISOString()}`);
    doc.moveDown();
    doc.fillColor('#000').fontSize(11);

    for (const row of rows) {
      doc.text(`${row.label}:  ${row.value}`);
    }

    doc.end();
    return done;
  }

  async toExcel(title: string, rows: ReportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(title.slice(0, 31));
    sheet.columns = [
      { header: 'Item', key: 'label', width: 45 },
      { header: 'Value', key: 'value', width: 25 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) sheet.addRow(row);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
