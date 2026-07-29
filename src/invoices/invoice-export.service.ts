import fs from 'node:fs';
import path from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { CompanySettings, InvoiceType, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { DEFAULT_COMPANY_NAME } from '../common/company.constants';
import { PrismaService } from '../prisma/prisma.service';

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: { lineItems: true; customer: true };
}>;

// Battambang (OFL): chosen over Noto Sans Khmer because fontkit (PDFKit's
// shaper) crashes on Noto's GPOS anchors for anusvara sequences like "ទំ".
const FONTS_DIR = path.join(__dirname, 'fonts');
const KHMER_REGULAR = path.join(FONTS_DIR, 'Battambang-Regular.ttf');
const KHMER_BOLD = path.join(FONTS_DIR, 'Battambang-Bold.ttf');

// Cleaned single-sheet copies of the client's real spreadsheets. Filling these
// (rather than rebuilding) is what makes the .xlsx match exactly: logo, Khmer
// Battambang font, borders and $/៛ number formats all come from the template.
const TEMPLATES_DIR = path.join(__dirname, 'templates');

/** Cell map for one invoice template; rows below `firstItemRow` shift when
 *  the pre-formatted item band overflows. */
interface TemplateLayout {
  file: string;
  invoiceNo: string;
  date: string;
  custCode: string | null;
  custName: string;
  custAddr: string;
  custVat: string;
  firstItemRow: number;
  templateItemRows: number;
  totalRow: number;
  vatRow: number | null;
  grandRow: number;
  rateRow: number;
  rielRow: number;
  depositRow: number;
  amountRow: number;
}

const TAX_INVOICE_LAYOUT: TemplateLayout = {
  file: 'tax-invoice.xlsx',
  invoiceNo: 'V15',
  date: 'V17',
  custCode: 'C15',
  custName: 'C16',
  custAddr: 'C17',
  custVat: 'C22',
  firstItemRow: 27,
  templateItemRows: 2,
  totalRow: 29,
  vatRow: 30,
  grandRow: 31,
  rateRow: 32,
  rielRow: 33,
  depositRow: 34,
  amountRow: 35,
};

const DEBIT_NOTE_LAYOUT: TemplateLayout = {
  file: 'debit-note.xlsx',
  invoiceNo: 'V17',
  date: 'V19',
  custCode: null,
  custName: 'C18',
  custAddr: 'C19',
  custVat: 'C24',
  firstItemRow: 27,
  templateItemRows: 1,
  totalRow: 28,
  vatRow: null,
  grandRow: 29,
  rateRow: 30,
  rielRow: 31,
  depositRow: 32,
  amountRow: 33,
};

// Item-row merges to restore after inserting extra rows: Description B:J,
// Qty K:N, Unit price O:R, Amount S:V, Remark W:AA.
const ITEM_MERGE_GROUPS: ReadonlyArray<[string, string]> = [
  ['B', 'J'],
  ['K', 'N'],
  ['O', 'R'],
  ['S', 'V'],
  ['W', 'AA'],
];

/** Shift a single cell address (e.g. "S31") down by `extra` rows when it sits
 *  at or below `firstShiftedRow`; used to move the totals block after inserting
 *  extra line-item rows. */
const shiftMergeAddr = (
  addr: string,
  firstShiftedRow: number,
  extra: number,
): string => {
  const m = /^([A-Z]+)(\d+)$/.exec(addr);
  if (!m) return addr;
  const row = Number(m[2]);
  return `${m[1]}${row >= firstShiftedRow ? row + extra : row}`;
};

const shiftMergeRange = (
  range: string,
  firstShiftedRow: number,
  extra: number,
): string =>
  range
    .split(':')
    .map((a) => shiftMergeAddr(a, firstShiftedRow, extra))
    .join(':');

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
  buyerSignature: 'ហត្ថលេខា និងឈ្មោះអ្នកទិញ',
  sellerSignature: 'ហត្ថលេខា និងឈ្មោះអ្នកលក់',
  footerNote: 'សម្គាល់៖ ច្បាប់ដើមសម្រាប់អ្នកទិញ ច្បាប់ចម្លងសម្រាប់អ្នកលក់',
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

    // Totals (right) and bank block (left) share the same top, below the items.
    const contentTop = doc.y;
    const totalsBottom = this.renderTotals(doc, invoice, company, contentTop);
    const bankBottom = this.renderBankFooter(doc, company, contentTop);
    let y = Math.max(totalsBottom, bankBottom) + 8;

    if (invoice.notes) {
      doc.font('Helvetica').fontSize(9).fillColor('#666');
      doc.text(`Notes: ${invoice.notes}`, 50, y, { width: 495 });
      y = doc.y + 6;
    }

    // Signature blocks, then the "original/copied" note pinned near the margin.
    y = this.renderSignatures(doc, y + 20);
    this.renderFooterNote(doc);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#999')
      .text(`Generated ${new Date().toISOString().slice(0, 10)}`, 50, 802, {
        lineBreak: false,
      });

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
        (company?.companyNameEn ?? DEFAULT_COMPANY_NAME).toUpperCase(),
        50,
        y,
        {
          width: 495,
          align: 'center',
        },
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
      [KH.customer, 'Customer', c.customerId ?? ''],
      [KH.name, 'Name', c.nameEn],
      [KH.address, 'Address', c.address ?? ''],
      [KH.telephone, 'Telephone N°', c.phone ?? ''],
      [KH.email, 'Email Address', c.email ?? ''],
      [KH.vatTin, 'VAT TIN', ''],
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
      // Light separator between rows.
      doc
        .moveTo(50, y - 3)
        .lineTo(545, y - 3)
        .strokeColor('#e2e2e2')
        .stroke();
    });
    const bodyBottom = y;
    // Column separators (below the header band) + outer box for a gridded look.
    const bodyTop = top + bandH;
    doc.strokeColor('#ccc').lineWidth(0.5);
    for (const col of cols) {
      if (col.x === 50) continue; // left edge handled by the outer box
      doc.moveTo(col.x, bodyTop).lineTo(col.x, bodyBottom).stroke();
    }
    doc
      .rect(50, top, 495, bodyBottom - top)
      .strokeColor('#999')
      .lineWidth(1)
      .stroke();
    doc.y = bodyBottom + 8;
  }

  private renderTotals(
    doc: PDFKit.PDFDocument,
    invoice: InvoiceWithRelations,
    company: CompanySettings | null,
    top: number,
  ): number {
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

    let y = top;
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
    return y;
  }

  private renderBankFooter(
    doc: PDFKit.PDFDocument,
    company: CompanySettings | null,
    top: number,
  ): number {
    const lines = [
      company?.bankAccountName && `Account Name: ${company.bankAccountName}`,
      company?.bankAccountNumber && `Account N°: ${company.bankAccountNumber}`,
      company?.bankName && `Bank: ${company.bankName}`,
      company?.swiftCode && `SWIFT CODE: ${company.swiftCode}`,
      company?.chequePayableNote,
    ].filter((l): l is string => Boolean(l));
    if (lines.length === 0) return top;

    // Bank block sits on the left, level with the totals stack on the right.
    let y = top;
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#000')
      .text('* Bank Information for remittance of payment:', 50, y, {
        width: 260,
      });
    y = doc.y + 2;
    doc.font('Helvetica').fontSize(8);
    for (const line of lines) {
      doc.text(line, 50, y, { width: 260 });
      y = doc.y + 1;
    }
    return y;
  }

  /** Two signature areas (buyer left, seller right) near the page bottom. */
  private renderSignatures(doc: PDFKit.PDFDocument, top: number): number {
    // Keep the block off the bottom margin; start a new page if too low.
    let y = top;
    if (y > 690) {
      doc.addPage();
      y = 70;
    }
    const cols: Array<[number, number, string, string]> = [
      [55, 250, KH.buyerSignature, 'Customer Signature & Name'],
      [320, 515, KH.sellerSignature, 'Seller Signature & Name'],
    ];
    const lineY = y + 24;
    for (const [x1, x2, kh, en] of cols) {
      doc.moveTo(x1, lineY).lineTo(x2, lineY).strokeColor('#999').stroke();
      const w = x2 - x1;
      let capY = lineY + 4;
      if (this.khmerAvailable) {
        try {
          doc
            .font('khmer')
            .fontSize(8)
            .fillColor('#000')
            .text(kh, x1, capY, { width: w, align: 'center' });
          capY = doc.y + 1;
        } catch {
          // Shaper failed — fall through to the English caption only.
        }
      }
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#000')
        .text(en, x1, capY, { width: w, align: 'center' });
    }
    return lineY + 30;
  }

  /** Centered "original for customer / copy for seller" note at the margin. */
  private renderFooterNote(doc: PDFKit.PDFDocument): void {
    let y = 772;
    if (this.khmerAvailable) {
      try {
        doc
          .font('khmer')
          .fontSize(8)
          .fillColor('#333')
          .text(KH.footerNote, 50, y, { width: 495, align: 'center' });
        y = doc.y;
      } catch {
        // Shaper failed — English line below is enough.
      }
    }
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#333')
      .text(
        'Note: Original Invoice for Customer, Copied Invoice for Seller',
        50,
        y,
        { width: 495, align: 'center' },
      );
  }

  /**
   * Render a single invoice into the client's exact Excel template — Tax
   * Invoice (with VAT) or Debit Note (no VAT). We load a copy of the real
   * `.xlsx` and only overwrite data cells, so the logo, Khmer Battambang font,
   * borders and $/៛ number formats are preserved verbatim.
   */
  async invoiceExcel(
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
    const rate = Number(company?.khrExchangeRate ?? 4100);

    const layout =
      invoice.invoiceType === InvoiceType.DEBIT_NOTE
        ? DEBIT_NOTE_LAYOUT
        : TAX_INVOICE_LAYOUT;

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(TEMPLATES_DIR, layout.file));

    // The templates were extracted from a larger workbook and still carry
    // defined names that point at external workbooks (e.g. '[2]020-112017'!$B$1,
    // '[5]Data'!...) with no backing xl/externalLinks part. ExcelJS re-serializes
    // them verbatim, which makes Excel report corrupt content and open the export
    // read-only. None of these names are used by the output, so clear them.
    // (Print_Area is stored on the worksheet page setup, not here, so it is kept.)
    wb.definedNames.model = [];

    const ws = wb.worksheets[0];

    // Header + customer block (all above the item band, so never shifted).
    ws.getCell(layout.invoiceNo).value = invoice.invoiceNumber;
    ws.getCell(layout.date).value = day(invoice.invoiceDate).replace(/-/g, '.');
    if (layout.custCode) {
      ws.getCell(layout.custCode).value = invoice.customer.customerId;
    }
    ws.getCell(layout.custName).value = invoice.customer.nameEn;
    ws.getCell(layout.custAddr).value = invoice.customer.address;
    ws.getCell(layout.custVat).value =
      invoice.taxIdNumber ?? invoice.customer.taxId ?? '';

    // Line items: expand the pre-formatted band when there are more items than
    // the template ships with. duplicateRow copies styles but not merges, so we
    // restore the item-row merges afterwards.
    const items = invoice.lineItems;
    const fir = layout.firstItemRow;
    const extra = Math.max(0, items.length - layout.templateItemRows);
    if (extra > 0) {
      // exceljs' duplicateRow does not shift merged cells correctly, so unmerge
      // everything first, insert the rows, then re-apply each merge at its new
      // position and merge the freshly inserted item rows.
      const firstShiftedRow = fir + layout.templateItemRows;
      const originalMerges = [...ws.model.merges];
      for (const range of originalMerges) ws.unMergeCells(range);
      ws.duplicateRow(fir, extra, true);
      for (const range of originalMerges) {
        ws.mergeCells(shiftMergeRange(range, firstShiftedRow, extra));
      }
      const lastItemRow = fir + items.length - 1;
      for (let r = firstShiftedRow; r <= lastItemRow; r++) {
        for (const [c1, c2] of ITEM_MERGE_GROUPS) {
          if (!ws.getCell(`${c1}${r}`).isMerged) {
            ws.mergeCells(`${c1}${r}:${c2}${r}`);
          }
        }
      }
    }
    items.forEach((li, i) => {
      const r = fir + i;
      ws.getCell(`A${r}`).value = li.itemNumber;
      ws.getCell(`B${r}`).value = li.description;
      ws.getCell(`K${r}`).value = Number(li.quantity);
      ws.getCell(`O${r}`).value = Number(li.unitPrice);
      ws.getCell(`S${r}`).value = { formula: `K${r}*O${r}` };
      if (li.notes) ws.getCell(`W${r}`).value = li.notes;
    });

    // Totals block — shifts down by `extra` once the item band overflows.
    const shift = (row: number): number => row + extra;
    const lastBandRow =
      fir + Math.max(items.length, layout.templateItemRows) - 1;
    const totalRow = shift(layout.totalRow);
    ws.getCell(`S${totalRow}`).value = {
      formula: `SUM(S${fir}:V${lastBandRow})`,
    };

    const grandRow = shift(layout.grandRow);
    if (layout.vatRow !== null) {
      const vatRow = shift(layout.vatRow);
      const pct = Number(invoice.taxRate);
      ws.getCell(`S${vatRow}`).value = { formula: `S${totalRow}*${pct}/100` };
      ws.getCell(`S${grandRow}`).value = { formula: `S${totalRow}+S${vatRow}` };
    } else {
      ws.getCell(`S${grandRow}`).value = { formula: `S${totalRow}` };
    }

    const rateRow = shift(layout.rateRow);
    ws.getCell(`P${rateRow}`).value = rate;
    ws.getCell(`S${shift(layout.rielRow)}`).value = {
      formula: `S${grandRow}*P${rateRow}`,
    };
    const depositRow = shift(layout.depositRow);
    ws.getCell(`S${depositRow}`).value = Number(invoice.deposit);
    ws.getCell(`S${shift(layout.amountRow)}`).value = {
      formula: `S${grandRow}-S${depositRow}`,
    };

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, invoiceNumber: invoice.invoiceNumber };
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
    const company = await this.prisma.companySettings.findFirst({
      select: { companyNameEn: true },
    });
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    doc.fontSize(16).text(company?.companyNameEn ?? DEFAULT_COMPANY_NAME);
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
