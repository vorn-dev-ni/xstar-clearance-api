import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: { lineItems: true; customer: true };
}>;

export type InvoiceListRow = Prisma.InvoiceGetPayload<{
  include: { customer: { select: { nameEn: true } } };
}>;

export interface InvoiceListSummary {
  totalInvoiced: number;
  totalPaid: number;
  totalDue: number;
}

const money = (n: Prisma.Decimal | number): string => Number(n).toFixed(2);
const day = (d: Date | null | undefined): string =>
  d ? d.toISOString().slice(0, 10) : '';

@Injectable()
export class InvoiceExportService {
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
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    this.renderHeader(doc, invoice, company);
    this.renderBillTo(doc, invoice);
    this.renderLineItems(doc, invoice);
    this.renderTotals(doc, invoice);

    if (invoice.notes) {
      doc.moveDown(1.5);
      doc.fontSize(9).fillColor('#666').text(`Notes: ${invoice.notes}`, 50);
    }
    doc
      .fontSize(8)
      .fillColor('#999')
      .text(`Generated ${new Date().toISOString()}`, 50, 780);

    doc.end();
    return { buffer: await done, invoiceNumber: invoice.invoiceNumber };
  }

  private renderHeader(
    doc: PDFKit.PDFDocument,
    invoice: InvoiceWithRelations,
    company: {
      companyNameEn: string;
      address: string | null;
      phone: string | null;
      email: string | null;
      vatId: string;
    } | null,
  ): void {
    doc
      .fontSize(16)
      .fillColor('#000')
      .text(
        company?.companyNameEn ?? 'S.T STAR Logistics & Customs Clearance',
        50,
        50,
        { width: 290 },
      );
    doc.fontSize(9).fillColor('#444');
    if (company?.address) doc.text(company.address, { width: 290 });
    const contact = [company?.phone, company?.email]
      .filter(Boolean)
      .join(' · ');
    if (contact) doc.text(contact);
    if (company?.vatId) doc.text(`VAT TIN: ${company.vatId}`);

    const title =
      invoice.invoiceType === 'DEBIT_NOTE' ? 'DEBIT NOTE' : 'TAX INVOICE';
    doc.fontSize(18).fillColor('#112E81').text(title, 350, 50, {
      width: 195,
      align: 'right',
    });
    doc.fontSize(10).fillColor('#000');
    doc.text(`No: ${invoice.invoiceNumber}`, 350, doc.y + 4, {
      width: 195,
      align: 'right',
    });
    doc.text(`Date: ${day(invoice.invoiceDate)}`, 350, doc.y, {
      width: 195,
      align: 'right',
    });
    if (invoice.dueDate) {
      doc.text(`Due: ${day(invoice.dueDate)}`, 350, doc.y, {
        width: 195,
        align: 'right',
      });
    }
    doc.text(`Status: ${invoice.status}`, 350, doc.y, {
      width: 195,
      align: 'right',
    });
  }

  private renderBillTo(
    doc: PDFKit.PDFDocument,
    invoice: InvoiceWithRelations,
  ): void {
    doc.moveDown(2);
    const y = Math.max(doc.y, 150);
    doc.fontSize(10).fillColor('#666').text('BILL TO', 50, y);
    doc.fontSize(11).fillColor('#000').text(invoice.customer.nameEn, 50);
    doc.fontSize(9).fillColor('#444');
    if (invoice.customer.address) doc.text(invoice.customer.address);
    if (invoice.customer.taxId) doc.text(`VAT TIN: ${invoice.customer.taxId}`);
    if (invoice.customer.phone) doc.text(`Tel: ${invoice.customer.phone}`);
    if (invoice.description) {
      doc.moveDown(0.5);
      doc.text(invoice.description);
    }
  }

  private renderLineItems(
    doc: PDFKit.PDFDocument,
    invoice: InvoiceWithRelations,
  ): void {
    doc.moveDown(1.5);
    const top = doc.y;
    doc.fontSize(9).fillColor('#000');
    doc.rect(50, top - 4, 495, 18).fill('#112E81');
    doc.fillColor('#fff');
    doc.text('#', 55, top, { width: 25 });
    doc.text('Description', 85, top, { width: 235 });
    doc.text('Qty', 325, top, { width: 45, align: 'right' });
    doc.text('Unit Price', 375, top, { width: 75, align: 'right' });
    doc.text('Amount', 455, top, { width: 85, align: 'right' });
    doc.fillColor('#000');

    let y = top + 20;
    invoice.lineItems.forEach((li, i) => {
      const descHeight = doc.heightOfString(li.description, { width: 235 });
      doc.text(String(li.itemNumber ?? i + 1), 55, y, { width: 25 });
      doc.text(li.description, 85, y, { width: 235 });
      doc.text(String(Number(li.quantity)), 325, y, {
        width: 45,
        align: 'right',
      });
      doc.text(money(li.unitPrice), 375, y, { width: 75, align: 'right' });
      doc.text(money(li.amount), 455, y, { width: 85, align: 'right' });
      y += Math.max(descHeight, 12) + 6;
    });
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#ccc').stroke();
    doc.y = y + 8;
  }

  private renderTotals(
    doc: PDFKit.PDFDocument,
    invoice: InvoiceWithRelations,
  ): void {
    const rows: Array<[string, string, boolean?]> = [
      ['Subtotal', money(invoice.subtotal)],
      [`VAT ${Number(invoice.taxRate)}%`, money(invoice.taxAmount)],
      [`TOTAL (${invoice.currency})`, money(invoice.totalAmount), true],
      ['Paid', money(invoice.paidAmount)],
      ['Balance Due', money(invoice.balanceDue), true],
    ];
    let y = doc.y;
    for (const [label, value, bold] of rows) {
      doc.fontSize(bold ? 11 : 10);
      doc.text(label, 325, y, { width: 125, align: 'right' });
      doc.text(value, 455, y, { width: 85, align: 'right' });
      y += bold ? 18 : 15;
    }
    doc.y = y;
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
