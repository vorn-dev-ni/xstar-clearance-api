import path from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';

const TEMPLATE = path.join(__dirname, 'templates', 'reconciliation.xlsx');

// Fixed template geometry (see scripts/build-reconciliation-template.js).
const FIRST_ITEM_ROW = 9;
const TEMPLATE_ITEM_ROWS = 12; // rows 9-20
const TOTAL_ROW = 21; // C21=SUM in, D21=SUM out
const ENDING_ROW = 22; // C22 = C8 + C21 - D21

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Shift a cell address's row down by `extra` when at/below `firstShiftedRow`. */
const shiftAddr = (
  addr: string,
  firstShiftedRow: number,
  extra: number,
): string => {
  const m = /^([A-Z]+)(\d+)$/.exec(addr);
  if (!m) return addr;
  const row = Number(m[2]);
  return `${m[1]}${row >= firstShiftedRow ? row + extra : row}`;
};
const shiftRange = (
  range: string,
  firstShiftedRow: number,
  extra: number,
): string =>
  range
    .split(':')
    .map((a) => shiftAddr(a, firstShiftedRow, extra))
    .join(':');

function periodText(start: Date, end: Date): string {
  const en = (d: Date) =>
    `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}, ${d.getUTCFullYear()}`;
  const zh = (d: Date) =>
    `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
  return `For the Period From ${en(start)} to ${en(end)}\n期间：自${zh(start)}至${zh(end)}`;
}

@Injectable()
export class BankReconciliationExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportExcel(
    id: string,
  ): Promise<{ buffer: Buffer; statementNumber: string }> {
    const statement = await this.prisma.bankReconciliation.findUnique({
      where: { id },
      include: { lines: { orderBy: { itemNumber: 'asc' } } },
    });
    if (!statement)
      throw new NotFoundException('Bank reconciliation not found');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(TEMPLATE);
    const ws = wb.worksheets[0];

    ws.getCell('A5').value = periodText(
      statement.periodStart,
      statement.periodEnd,
    );
    ws.getCell('C8').value = Number(statement.openingBalance);

    const lines = statement.lines;
    const fir = FIRST_ITEM_ROW;
    const extra = Math.max(0, lines.length - TEMPLATE_ITEM_ROWS);
    if (extra > 0) {
      // exceljs' duplicateRow mishandles merges, so unmerge → insert → re-merge
      // the below-band ranges (Total/Ending/signature) at their shifted rows.
      // Body rows carry no merges, so none need restoring.
      const firstShiftedRow = fir + TEMPLATE_ITEM_ROWS;
      const originalMerges = [...ws.model.merges];
      for (const range of originalMerges) ws.unMergeCells(range);
      ws.duplicateRow(fir, extra, true);
      for (const range of originalMerges) {
        ws.mergeCells(shiftRange(range, firstShiftedRow, extra));
      }
    }

    lines.forEach((l, i) => {
      const r = fir + i;
      ws.getCell(`A${r}`).value = l.itemNumber;
      ws.getCell(`B${r}`).value = l.description;
      if (Number(l.moneyIn) !== 0)
        ws.getCell(`C${r}`).value = Number(l.moneyIn);
      if (Number(l.moneyOut) !== 0)
        ws.getCell(`D${r}`).value = Number(l.moneyOut);
      ws.getCell(`E${r}`).value = { formula: `E${r - 1}+C${r}-D${r}` };
      if (l.remark) ws.getCell(`F${r}`).value = l.remark;
    });

    // Totals + ending shift down by `extra` once the body band overflows.
    const shift = (row: number): number => row + extra;
    const lastBandRow = fir + Math.max(lines.length, TEMPLATE_ITEM_ROWS) - 1;
    const totalRow = shift(TOTAL_ROW);
    ws.getCell(`C${totalRow}`).value = {
      formula: `SUM(C${fir}:C${lastBandRow})`,
    };
    ws.getCell(`D${totalRow}`).value = {
      formula: `SUM(D${fir}:D${lastBandRow})`,
    };
    ws.getCell(`C${shift(ENDING_ROW)}`).value = {
      formula: `C8+C${totalRow}-D${totalRow}`,
    };

    // Signature labels (rows 26/29) are carried by the template as-is.
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, statementNumber: statement.statementNumber };
  }
}
