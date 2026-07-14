import fs from 'node:fs';
import path from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { CompanySettings, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: { lineItems: true; customer: true };
}>;

// Battambang (OFL): chosen over Noto Sans Khmer because fontkit (PDFKit's
// shaper) crashes on Noto's GPOS anchors for anusvara sequences like "ទំ".
const FONTS_DIR = path.join(__dirname, 'fonts');
const KHMER_REGULAR = path.join(FONTS_DIR, 'Battambang-Regular.ttf');
const KHMER_BOLD = path.join(FONTS_DIR, 'Battambang-Bold.ttf');

/** Khmer labels for the bilingual invoice template. */
const KH = {
  taxInvoice: 'វិក្កយបត្រអាករ',
  debitNote: 'លិខិតបំណុល',
  invoiceNo: 'លេខរៀងវិក្កយបត្រ',
  date: 'កាលបរិច្ឆេទ',
  customer: 'អតិថិជន',
  name: 'ឈ្មោះ',
  address: 'អាសយដ្ឋាន',
  telephone: 'ទូរស័ព្ទលេខ',
  email: 'អ៊ីមែល',
  vatTin: 'លេខអាករ',
  no: 'ល.រ',
  description: 'បរិយាយមុខទំនិញ',
  quantity: 'បរិមាណ',
  unitPrice: 'តម្លៃឯកតា',
  amount: 'ថ្លៃទំនិញ',
  remark: 'ផ្សេងៗ',
  total: 'សរុប',
  grandTotal: 'សរុបរួម',
  rate: 'អត្រា',
  grandTotalRiel: 'សរុបរួមជារៀល',
  deposit: 'ប្រាក់កក់',
  amountToBePaid: 'ប្រាក់ត្រូវបង់',
};

export type InvoiceListRow = Prisma.InvoiceGetPayload<{
  include: { customer: { select: { nameEn: true } } };
}>;

export interface InvoiceListSummary {
  totalInvoiced: number;
  totalPaid: number;
  totalDue: number;
}

const money = (n: Prisma.Decimal | number): string =>
  Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const day = (d: Date | null | undefined): string =>
  d ? d.toISOString().slice(0, 10) : '';

@Injectable()
export class InvoiceExportService {
  /** Khmer labels degrade to English-only when the font asset is missing. */
  private readonly khmerAvailable =
    fs.existsSync(KHMER_REGULAR) && fs.existsSync(KHMER_BOLD);

  constructor(private readonly prisma: PrismaService) {}

  /** Render a single invoice as a printable PDF document. */
  async invoicePdf(
    invoiceId: string,
  ): Promise<{ buffer: Buffer; invoiceNumber: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lineItems: { orderBy: { itemNumber: 'asc' } },
        customer: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const company = await this.prisma.companySettings.findFirst();

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    if (this.khmerAvailable) {
      doc.registerFont('khmer', KHMER_REGULAR);
      doc.registerFont('khmer-bold', KHMER_BOLD);
    }
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    this.renderHeader(doc, invoice, company);
    this.renderCustomerBlock(doc, invoice);
    this.renderLineItems(doc, invoice);
    this.renderTotals(doc, invoice, company);
    this.renderBankFooter(doc, company);

    if (invoice.notes) {
      doc.moveDown(1);
      doc.fontSize(9).fillColor('#666').text(`Notes: ${invoice.notes}`, 50);
    }
    doc
      .fontSize(8)
      .fillColor('#999')
      .text(`Generated ${new Date().toISOString().slice(0, 10)}`, 50, 790);

    doc.end();
    return { buffer: await done, invoiceNumber: invoice.invoiceNumber };
  }

  /**
   * Draw "ខ្មែរ/English" as two runs so Khmer uses the embedded Noto font
   * while Latin stays in Helvetica. Falls back to English-only.
   */
  private biText(
    doc: PDFKit.PDFDocument,
    kh: string,
    en: string,
    x: number,
    y: number,
    opts: { size?: number; bold?: boolean; width?: number } = {},
  ): void {
    const size = opts.size ?? 9;
    const enFont = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
    if (!this.khmerAvailable) {
      doc
        .font(enFont)
        .fontSize(size)
        .text(en, x, y, { width: opts.width, lineBreak: false });
      return;
    }
    const khFont = opts.bold ? 'khmer-bold' : 'khmer';
    try {
      doc.font(khFont).fontSize(size).text(kh, x, y, { lineBreak: false });
      const w = doc.widthOfString(kh);
      doc
        .font(enFont)
        .fontSize(size)
        .text(`/${en}`, x + w + 1, y + 2, { lineBreak: false });
    } catch {
      // Shaper failed on this string — fall back to the English label.
      doc
        .font(enFont)
        .fontSize(size)
        .text(en, x, y, { width: opts.width, lineBreak: false });
    }
    doc.font('Helvetica');
  }

  private renderHeader(
    doc: PDFKit.PDFDocument,
    invoice: InvoiceWithRelations,
    company: CompanySettings | null,
  ): void {
    // Centered company block, Khmer name above the English name.
    let y = 46;
    if (this.khmerAvailable && company?.companyNameKh) {
      try {
        doc
          .font('khmer-bold')
          .fontSize(13)
          .fillColor('#112E81')
          .text(company.companyNameKh, 50, y, { width: 495, align: 'center' });
        y = doc.y + 2;
      } catch {
        // Shaper failed on the Khmer name — continue with the English block.
      }
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#112E81')
      .text(
        (
          company?.companyNameEn ??
          'S.T STAR LOGISTICS & CUSTOMS CLEARANCE SERVICE CO., LTD'
        ).toUpperCase(),
        50,
        y,
        { width: 495, align: 'center' },
      );
    doc.font('Helvetica').fontSize(8).fillColor('#444');
    const addressLine = [company?.address, company?.province, company?.country]
      .filter(Boolean)
      .join(', ');
    if (addressLine)
      doc.text(addressLine, 50, doc.y + 2, { width: 495, align: 'center' });
    const contact = [
      company?.phone && `Tel: ${company.phone}`,
      company?.email && `Email: ${company.email}`,
    ]
      .filter(Boolean)
      .join('   ');
    if (contact)
      doc.text(contact, 50, doc.y + 1, { width: 495, align: 'center' });
    if (company?.vatId) {
      doc.text(`VAT TIN: ${company.vatId}`, 50, doc.y + 1, {
        width: 495,
        align: 'center',
      });
    }
    doc
      .moveTo(50, doc.y + 6)
      .lineTo(545, doc.y + 6)
      .strokeColor('#112E81')
      .lineWidth(1.5)
      .stroke()
      .lineWidth(1);

    // Centered bilingual document title.
    const isDebitNote = invoice.invoiceType === 'DEBIT_NOTE';
    const titleY = doc.y + 14;
    if (this.khmerAvailable) {
      doc
        .font('khmer-bold')
        .fontSize(14)
        .fillColor('#000')
        .text(isDebitNote ? KH.debitNote : KH.taxInvoice, 50, titleY, {
          width: 495,
          align: 'center',
        });
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#000')
      .text(isDebitNote ? 'DEBIT NOTE' : 'TAX INVOICE', 50, doc.y + 1, {
        width: 495,
        align: 'center',
      });

    // Invoice number + date, top right under the title.
    const metaY = doc.y + 10;
    this.biText(doc, KH.invoiceNo, 'Invoice N°', 370, metaY, { size: 8 });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#000')
      .text(invoice.invoiceNumber, 490, metaY, { lineBreak: false });
    this.biText(doc, KH.date, 'Date', 370, metaY + 15, { size: 8 });
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(day(invoice.invoiceDate), 490, metaY + 15, { lineBreak: false });
    doc.y = metaY;
  }

  private renderCustomerBlock(
    doc: PDFKit.PDFDocument,
    invoice: InvoiceWithRelations,
  ): void {
    const c = invoice.customer;
    const rows: Array<[string, string, string]> = [
      [KH.customer, 'Customer', c.code ?? ''],
      [KH.name, 'Name', c.nameEn],
      [KH.address, 'Address', c.address ?? ''],
      [KH.telephone, 'Telephone N°', c.phone ?? ''],
      [KH.email, 'Email Address', c.email ?? ''],
      [KH.vatTin, 'VAT TIN', c.taxId ?? ''],
    ];
    let y = doc.y + 4;
    for (const [kh, en, value] of rows) {
      this.biText(doc, kh, en, 50, y, { size: 8 });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#000')
        .text(value, 160, y + 2, { width: 200, lineBreak: false });
      doc
        .moveTo(160, y + 13)
        .lineTo(360, y + 13)
        .strokeColor('#bbb')
        .stroke();
      y += 17;
    }
    doc.y = y + 6;
  }

  private renderLineItems(
    doc: PDFKit.PDFDocument,
    invoice: InvoiceWithRelations,
  ): void {
    const top = doc.y;
    const cols = [
      { kh: KH.no, en: 'N°', x: 50, w: 28, align: 'left' as const },
      {
        kh: KH.description,
        en: 'Description',
        x: 78,
        w: 202,
        align: 'left' as const,
      },
      {
        kh: KH.quantity,
        en: 'Quantity',
        x: 280,
        w: 55,
        align: 'right' as const,
      },
      {
        kh: KH.unitPrice,
        en: 'Unit Price',
        x: 335,
        w: 70,
        align: 'right' as const,
      },
      {
        kh: KH.amount,
        en: 'Amount (US$)',
        x: 405,
        w: 85,
        align: 'right' as const,
      },
      { kh: KH.remark, en: 'Remark', x: 490, w: 55, align: 'left' as const },
    ];

    // Two-line bilingual header band: Khmer row above the English row.
    const bandH = this.khmerAvailable ? 30 : 18;
    doc.rect(50, top, 495, bandH).fill('#112E81');
    for (const col of cols) {
      if (this.khmerAvailable) {
        doc
          .font('khmer')
          .fontSize(7)
          .fillColor('#fff')
          .text(col.kh, col.x + 3, top + 2, {
            width: col.w - 6,
            align: col.align,
            lineBreak: false,
          });
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .fillColor('#fff')
        .text(col.en, col.x + 3, top + bandH - 12, {
          width: col.w - 6,
          align: col.align,
        });
    }
    doc.font('Helvetica').fillColor('#000');

    let y = top + bandH + 5;
    invoice.lineItems.forEach((li, i) => {
      const descHeight = doc
        .fontSize(9)
        .heightOfString(li.description, { width: cols[1].w - 6 });
      doc.text(String(li.itemNumber ?? i + 1), cols[0].x + 3, y, {
        width: cols[0].w - 6,
      });
      doc.text(li.description, cols[1].x + 3, y, { width: cols[1].w - 6 });
      doc.text(String(Number(li.quantity)), cols[2].x + 3, y, {
        width: cols[2].w - 6,
        align: 'right',
      });
      doc.text(money(li.unitPrice), cols[3].x + 3, y, {
        width: cols[3].w - 6,
        align: 'right',
      });
      doc.text(money(li.amount), cols[4].x + 3, y, {
        width: cols[4].w - 6,
        align: 'right',
      });
      if (li.notes) {
        doc.fontSize(8).text(li.notes, cols[5].x + 3, y, {
          width: cols[5].w - 6,
          height: 10,
          ellipsis: true,
        });
        doc.fontSize(9);
      }
      y += Math.max(descHeight, 12) + 6;
    });
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#999').stroke();
    doc.y = y + 8;
  }

  private renderTotals(
    doc: PDFKit.PDFDocument,
    invoice: InvoiceWithRelations,
    company: CompanySettings | null,
  ): void {
    const rate = Number(company?.khrExchangeRate ?? 4100);
    const totalUsd = Number(invoice.totalAmount);
    const riel = Math.round(totalUsd * rate);
    const fmtRiel = `${riel.toLocaleString('en-US')} KHR`;

    const rows: Array<{
      kh: string;
      en: string;
      value: string;
      bold?: boolean;
    }> = [
      { kh: KH.total, en: 'Total', value: money(invoice.subtotal) },
      {
        kh: '',
        en: `VAT ${Number(invoice.taxRate)}%`,
        value: money(invoice.taxAmount),
      },
      {
        kh: KH.grandTotal,
        en: 'Grand Total',
        value: `$ ${money(invoice.totalAmount)}`,
        bold: true,
      },
      {
        kh: KH.rate,
        en: 'Rate',
        value: `1$ = ${rate.toLocaleString('en-US')} KHR`,
      },
      { kh: KH.grandTotalRiel, en: 'Grand Total in Riel', value: fmtRiel },
      { kh: KH.deposit, en: 'Deposit', value: money(invoice.paidAmount) },
      {
        kh: KH.amountToBePaid,
        en: 'Amount to be Paid',
        value: `$ ${money(invoice.balanceDue)}`,
        bold: true,
      },
    ];

    let y = doc.y;
    for (const row of rows) {
      if (row.bold) {
        doc
          .moveTo(315, y - 2)
          .lineTo(545, y - 2)
          .strokeColor('#666')
          .stroke();
      }
      this.biText(doc, row.kh, row.en, 315, y, {
        size: 8,
        bold: row.bold,
      });
      doc
        .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .fillColor('#000')
        .text(row.value, 445, y + 1, { width: 100, align: 'right' });
      y += row.bold ? 18 : 15;
    }
    doc.font('Helvetica');
    doc.y = y;
  }

  private renderBankFooter(
    doc: PDFKit.PDFDocument,
    company: CompanySettings | null,
  ): void {
    const lines = [
      company?.bankAccountName && `Account Name: ${company.bankAccountName}`,
      company?.bankAccountNumber && `Account N°: ${company.bankAccountNumber}`,
      company?.bankName && `Bank: ${company.bankName}`,
      company?.swiftCode && `SWIFT CODE: ${company.swiftCode}`,
      company?.chequePayableNote,
    ].filter((l): l is string => Boolean(l));
    if (lines.length === 0) return;

    // Bank block sits left of the totals; anchor it below the line items.
    const y = doc.y - 15 * lines.length - 3;
    doc.fontSize(8).fillColor('#000');
    lines.forEach((line, i) => {
      doc.text(line, 50, Math.max(y, 50) + i * 13, { width: 250 });
    });
  }

  /** Export a filtered invoice list as an Excel workbook. */
  async listToExcel(
    rows: InvoiceListRow[],
    summary: InvoiceListSummary,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Invoices');
    sheet.columns = [
      { header: 'Invoice #', key: 'invoiceNumber', width: 14 },
      { header: 'Date', key: 'invoiceDate', width: 12 },
      { header: 'Due Date', key: 'dueDate', width: 12 },
      { header: 'Customer', key: 'customer', width: 32 },
      { header: 'Type', key: 'invoiceType', width: 12 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Currency', key: 'currency', width: 9 },
      { header: 'Subtotal', key: 'subtotal', width: 12 },
      { header: 'VAT', key: 'taxAmount', width: 10 },
      { header: 'Total', key: 'totalAmount', width: 12 },
      { header: 'Paid', key: 'paidAmount', width: 12 },
      { header: 'Balance Due', key: 'balanceDue', width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const inv of rows) {
      sheet.addRow({
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: day(inv.invoiceDate),
        dueDate: day(inv.dueDate),
        customer: inv.customer.nameEn,
        invoiceType: inv.invoiceType,
        status: inv.status,
        currency: inv.currency,
        subtotal: Number(inv.subtotal),
        taxAmount: Number(inv.taxAmount),
        totalAmount: Number(inv.totalAmount),
        paidAmount: Number(inv.paidAmount),
        balanceDue: Number(inv.balanceDue),
      });
    }

    const totalRow = sheet.addRow({
      customer: `TOTAL (${rows.length} invoices)`,
      totalAmount: summary.totalInvoiced,
      paidAmount: summary.totalPaid,
      balanceDue: summary.totalDue,
    });
    totalRow.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /** Export a filtered invoice list as a tabular PDF. */
  async listToPdf(
    rows: InvoiceListRow[],
    summary: InvoiceListSummary,
  ): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    doc.fontSize(16).text('S.T STAR Logistics & Customs Clearance');
    doc.moveDown(0.3);
    doc.fontSize(13).text('Invoice List');
    doc
      .fontSize(8)
      .fillColor('#666')
      .text(`Generated ${new Date().toISOString()}`);
    doc.moveDown();

    const header = (y: number): void => {
      doc.fontSize(8).fillColor('#000');
      doc.text('Invoice #', 50, y, { width: 70 });
      doc.text('Date', 125, y, { width: 55 });
      doc.text('Customer', 185, y, { width: 150 });
      doc.text('Status', 340, y, { width: 75 });
      doc.text('Total', 420, y, { width: 55, align: 'right' });
      doc.text('Balance', 480, y, { width: 65, align: 'right' });
      doc
        .moveTo(50, y + 12)
        .lineTo(545, y + 12)
        .strokeColor('#999')
        .stroke();
    };

    let y = doc.y;
    header(y);
    y += 18;
    doc.fillColor('#000');
    for (const inv of rows) {
      if (y > 760) {
        doc.addPage();
        y = 50;
        header(y);
        y += 18;
      }
      doc.fontSize(8);
      doc.text(inv.invoiceNumber, 50, y, { width: 70 });
      doc.text(day(inv.invoiceDate), 125, y, { width: 55 });
      doc.text(inv.customer.nameEn, 185, y, {
        width: 150,
        height: 10,
        ellipsis: true,
      });
      doc.text(inv.status, 340, y, { width: 75 });
      doc.text(money(inv.totalAmount), 420, y, { width: 55, align: 'right' });
      doc.text(money(inv.balanceDue), 480, y, { width: 65, align: 'right' });
      y += 14;
    }

    doc.moveTo(50, y).lineTo(545, y).strokeColor('#999').stroke();
    y += 6;
    doc.fontSize(9);
    doc.text(`TOTAL (${rows.length} invoices)`, 185, y, { width: 150 });
    doc.text(money(summary.totalInvoiced), 420, y, {
      width: 55,
      align: 'right',
    });
    doc.text(money(summary.totalDue), 480, y, { width: 65, align: 'right' });

    doc.end();
    return done;
  }
}
