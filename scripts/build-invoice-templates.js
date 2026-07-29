/* eslint-disable */
/**
 * One-off build step: derive clean, single-sheet invoice/debit-note template
 * assets from the client's real spreadsheets, preserving the embedded logo,
 * Khmer Battambang font, borders, merges and number formats.
 *
 * Source files live at the repo root (../.. from this backend). The cleaned
 * outputs are written into src/invoices/templates and committed.
 *
 * Run: node scripts/build-invoice-templates.js
 */
const path = require('node:path');
const ExcelJS = require('exceljs');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.resolve(__dirname, '..', 'src', 'invoices', 'templates');

// Columns holding stray helper cells (License-fee/duty calcs, VIN, #REF! formulas).
const HELPER_COLS = ['AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH'];

function clearCell(ws, addr) {
  const cell = ws.getCell(addr);
  cell.value = null;
}

function clearHelperColumns(ws, fromRow, toRow) {
  for (let r = fromRow; r <= toRow; r++) {
    for (const col of HELPER_COLS) clearCell(ws, `${col}${r}`);
  }
}

async function buildTaxInvoice() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(ROOT, 'tax invoice template.xlsx'));
  const ws = wb.worksheets[0]; // 'xin 000028'

  // Clear example-specific data (runtime overwrites these).
  ['V15', 'V17', 'C15', 'C16', 'C17', 'C18', 'C19', 'C22'].forEach((a) => clearCell(ws, a));
  // Line-item example row.
  ['A27', 'B27', 'K27', 'O27', 'S27', 'W27'].forEach((a) => clearCell(ws, a));
  // Deposit example value.
  clearCell(ws, 'S34');
  // Fix stale hardcoded Grand-Total-in-Riel formula -> derive from grand total.
  ws.getCell('S33').value = { formula: 'S31*P32' };
  clearHelperColumns(ws, 1, 54);

  await wb.xlsx.writeFile(path.join(OUT_DIR, 'tax-invoice.xlsx'));
  console.log('tax-invoice.xlsx written; images:', ws.getImages().length);
}

async function buildDebitNote() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(ROOT, 'debit note.xlsx'));

  // Keep only the reference sheet that matches the client's debit-note output.
  const KEEP = 'Taisheng 1 container (2)';
  for (const ws of [...wb.worksheets]) {
    if (ws.name !== KEEP) wb.removeWorksheet(ws.id);
  }
  const ws = wb.getWorksheet(KEEP);

  ['V17', 'V19', 'C18', 'C20'].forEach((a) => clearCell(ws, a));
  ['A27', 'B27', 'K27', 'O27', 'S27', 'W27'].forEach((a) => clearCell(ws, a));
  clearCell(ws, 'S32'); // deposit
  clearHelperColumns(ws, 1, 65);

  await wb.xlsx.writeFile(path.join(OUT_DIR, 'debit-note.xlsx'));
  console.log('debit-note.xlsx written; sheets:', wb.worksheets.map((w) => w.name), 'images:', ws.getImages().length);
}

(async () => {
  await buildTaxInvoice();
  await buildDebitNote();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
