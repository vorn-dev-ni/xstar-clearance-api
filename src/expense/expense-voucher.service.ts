import { Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { DEFAULT_COMPANY_NAME } from '../common/company.constants';
import { PrismaService } from '../prisma/prisma.service';
import { amountToWords } from './amount-to-words';

const TEMPLATE = path.join(__dirname, 'templates', 'payment-voucher.xlsx');

// Canonical cell layout of the voucher template (before any row overflow).
const FIRST_ITEM_ROW = 12;
const TEMPLATE_ITEM_ROWS = 6; // rows 12..17
const NOTE_ROW = 19;
const SUBTOTAL_ROW = 20;
const CASH_ADVANCE_ROW = 21;
const PAYABLE_ROW = 22;
const ACCOUNT_ROW = 25;
const WORDS_ROW = 28;

// Merges at/below the item band that must shift down when extra rows are inserted.
const LOWER_MERGES = [
  'A18:H18',
  'A19:H19',
  'G20:H20',
  'G21:H21',
  'G22:H22',
  'A25:C25',
  'D25:E25',
  'H25:I25',
  'A34:C34',
  'D34:E34',
  'G34:I34',
  'A42:B42',
  'D42:E42',
];

interface VoucherItem {
  itemNumber: number;
  acCode: string | null;
  itemDate: Date | null;
  invoiceNumber: string | null;
  description: string;
  amount: number;
}

type ExpenseForVoucher = {
  recordNumber: string;
  recordDate: Date;
  description: string;
  currency: string;
  supplierName: string | null;
  supplier: { nameEn: string } | null;
  purpose: string | null;
  invoiceNumber: string | null;
  accountNumber: string | null;
  accountName: string | null;
  cashAdvance: unknown;
  paymentMethod: string | null;
  note: string | null;
  amount: unknown;
  account?: { code: string } | null;
  items?: Array<{
    itemNumber: number;
    acCode: string | null;
    itemDate: Date | null;
    invoiceNumber: string | null;
    description: string;
    amount: unknown;
  }>;
};

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Format as DD-MMM-YY, e.g. 27-Aug-25 (matches the template). */
function fmtDate(d: Date | null | undefined): string {
  if (!d) return '';
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}-${MONTHS[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(-2)}`;
}

const shiftAddr = (addr: string, from: number, extra: number): string => {
  const m = /^([A-Z]+)(\d+)$/.exec(addr);
  if (!m) return addr;
  const row = Number(m[2]);
  return `${m[1]}${row >= from ? row + extra : row}`;
};
const shiftRange = (range: string, from: number, extra: number): string =>
  range
    .split(':')
    .map((a) => shiftAddr(a, from, extra))
    .join(':');

@Injectable()
export class ExpenseVoucherService {
  constructor(private readonly prisma: PrismaService) {}

  /** Single expense → a one-sheet Payment Voucher workbook. */
  async voucherExcel(
    id: string,
  ): Promise<{ buffer: Buffer; recordNumber: string }> {
    const expense = (await this.prisma.expenseRecord.findUnique({
      where: { id },
      include: {
        supplier: { select: { nameEn: true } },
        account: { select: { code: true } },
        items: { orderBy: { itemNumber: 'asc' } },
      },
    })) as ExpenseForVoucher | null;
    if (!expense) throw new NotFoundException('Expense record not found');
    const company = await this.companyName();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(TEMPLATE);
    wb.definedNames.model = [];
    const ws = wb.worksheets[0];
    ws.name = sheetName(expense, new Set());
    this.fillSheet(ws, expense, company);

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, recordNumber: expense.recordNumber };
  }

  /** Many expenses → one workbook with a voucher sheet per expense. */
  async vouchersWorkbook(expenses: ExpenseForVoucher[]): Promise<Buffer> {
    const company = await this.companyName();
    const wb = new ExcelJS.Workbook();
    const used = new Set<string>();
    for (const expense of expenses) {
      // Load a fresh template sheet for each voucher, then copy it in.
      const src = new ExcelJS.Workbook();
      await src.xlsx.readFile(TEMPLATE);
      src.definedNames.model = [];
      const ws = src.worksheets[0];
      const name = sheetName(expense, used);
      ws.name = name;
      this.fillSheet(ws, expense, company);
      copySheet(wb, ws, name);
    }
    if (wb.worksheets.length === 0) wb.addWorksheet('Vouchers');
    wb.definedNames.model = [];
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async companyName(): Promise<string> {
    const company = await this.prisma.companySettings.findFirst({
      select: { companyNameEn: true },
    });
    return company?.companyNameEn ?? DEFAULT_COMPANY_NAME;
  }

  private fillSheet(
    ws: ExcelJS.Worksheet,
    expense: ExpenseForVoucher,
    company: string,
  ): void {
    const items = voucherItems(expense);
    const extra = Math.max(0, items.length - TEMPLATE_ITEM_ROWS);
    if (extra > 0) insertItemRows(ws, items.length, extra);

    const at = (row: number) => (row >= NOTE_ROW ? row + extra : row);
    const payee = expense.supplierName || expense.supplier?.nameEn || '';
    const subtotal = round2(items.reduce((s, i) => s + i.amount, 0));
    const cashAdvance = num(expense.cashAdvance);
    const payable = round2(subtotal - cashAdvance);

    // Header
    ws.getCell('A1').value = company;
    ws.getCell('B4').value = payee;
    ws.getCell('I4').value = expense.recordNumber;
    ws.getCell('B5').value = expense.purpose ?? '';
    ws.getCell('I7').value = fmtDate(expense.recordDate);
    ws.getCell('I9').value = expense.currency || 'USD';

    // Item rows
    items.forEach((it, i) => {
      const r = FIRST_ITEM_ROW + i;
      ws.getCell(`A${r}`).value = it.itemNumber;
      ws.getCell(`B${r}`).value = it.acCode ?? expense.account?.code ?? '';
      ws.getCell(`C${r}`).value = fmtDate(it.itemDate ?? expense.recordDate);
      ws.getCell(`D${r}`).value = it.invoiceNumber ?? '';
      ws.getCell(`E${r}`).value = it.description;
      ws.getCell(`I${r}`).value = it.amount;
    });

    // Note + totals (shift down past inserted rows)
    if (expense.note) ws.getCell(`A${at(NOTE_ROW)}`).value = `Note: ${expense.note}`;
    ws.getCell(`I${at(SUBTOTAL_ROW)}`).value = subtotal;
    ws.getCell(`I${at(CASH_ADVANCE_ROW)}`).value = cashAdvance;
    ws.getCell(`I${at(PAYABLE_ROW)}`).value = payable;

    // Account block + payment method box
    ws.getCell(`A${at(ACCOUNT_ROW)}`).value =
      `Account Number : ${expense.accountNumber ?? ''} 账户号码`;
    ws.getCell(`D${at(ACCOUNT_ROW)}`).value =
      `Account Name: ${expense.accountName ?? ''} 账户名称`;
    const tick = (on: boolean) => (on ? '☑' : 'o');
    ws.getCell(`G${at(ACCOUNT_ROW)}`).value =
      `${tick(expense.paymentMethod === 'CASH')} Cash    现金`;
    ws.getCell(`H${at(ACCOUNT_ROW)}`).value =
      `${tick(expense.paymentMethod === 'CHEQUE')} Cheque 支票`;

    // Total in words
    ws.getCell(`B${at(WORDS_ROW)}`).value = amountToWords(
      payable,
      expense.currency || 'USD',
    );
  }
}

/** Real items, or a single synthesized line for legacy/flat expenses. */
function voucherItems(expense: ExpenseForVoucher): VoucherItem[] {
  if (expense.items?.length) {
    return expense.items.map((i) => ({
      itemNumber: i.itemNumber,
      acCode: i.acCode,
      itemDate: i.itemDate,
      invoiceNumber: i.invoiceNumber,
      description: i.description,
      amount: num(i.amount),
    }));
  }
  return [
    {
      itemNumber: 1,
      acCode: null,
      itemDate: expense.recordDate,
      invoiceNumber: expense.invoiceNumber,
      description: expense.description,
      amount: num(expense.amount),
    },
  ];
}

/** Insert `extra` item rows by duplicating the last template item row, then
 *  re-apply the E:H merges and shift the lower merge block down. */
function insertItemRows(
  ws: ExcelJS.Worksheet,
  itemCount: number,
  extra: number,
): void {
  const lastItemRow = FIRST_ITEM_ROW + TEMPLATE_ITEM_ROWS - 1; // 17
  // Unmerge the existing item + lower merges so duplicateRow doesn't corrupt them.
  for (let r = FIRST_ITEM_ROW; r <= lastItemRow; r++) {
    safeUnmerge(ws, `E${r}:H${r}`);
  }
  for (const range of LOWER_MERGES) safeUnmerge(ws, range);

  ws.duplicateRow(lastItemRow, extra, true);

  // Re-merge every item row's description band (E:H).
  for (let i = 0; i < itemCount; i++) {
    const r = FIRST_ITEM_ROW + i;
    safeMerge(ws, `E${r}:H${r}`);
  }
  // Re-merge the lower block at its shifted position.
  for (const range of LOWER_MERGES) {
    safeMerge(ws, shiftRange(range, NOTE_ROW, extra));
  }
}

function safeUnmerge(ws: ExcelJS.Worksheet, range: string): void {
  try {
    ws.unMergeCells(range);
  } catch {
    /* not merged — ignore */
  }
}
function safeMerge(ws: ExcelJS.Worksheet, range: string): void {
  try {
    ws.mergeCells(range);
  } catch {
    /* already merged — ignore */
  }
}

/** Copy a filled worksheet (values + styles + merges) into `wb`. Assigning the
 *  model carries rows/columns/values but drops merges, so re-apply them. */
function copySheet(
  wb: ExcelJS.Workbook,
  src: ExcelJS.Worksheet,
  name: string,
): void {
  const dst = wb.addWorksheet(name);
  const model = src.model as ExcelJS.Worksheet['model'] & { merges?: string[] };
  dst.model = { ...model, name, id: dst.id } as ExcelJS.Worksheet['model'];
  dst.name = name;
  for (const range of model.merges ?? []) {
    try {
      dst.mergeCells(range);
    } catch {
      /* already merged — ignore */
    }
  }
}

/** Unique, Excel-safe sheet name (≤31 chars, no []:*?/\\). */
function sheetName(expense: ExpenseForVoucher, used: Set<string>): string {
  const base =
    (expense.supplierName || expense.supplier?.nameEn || expense.recordNumber)
      .replace(/[\\/?*[\]:]/g, ' ')
      .slice(0, 28)
      .trim() || expense.recordNumber;
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    name = `${base.slice(0, 24)} (${n++})`;
  }
  used.add(name.toLowerCase());
  return name;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const num = (v: unknown): number => Number(v ?? 0);
