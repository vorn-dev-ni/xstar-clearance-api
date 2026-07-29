/* eslint-disable */
/**
 * One-off build step: derive a clean single-sheet "Reconciled with bank"
 * template from the client's real workbook, preserving the bilingual EN/中文
 * headers, borders, $ number formats and signature block. Data cells (period,
 * opening balance, body rows 9-20) are cleared; the total/ending formulas and
 * labels are kept. The runtime fills a copy of this file.
 *
 * Run: node scripts/build-reconciliation-template.js
 */
const path = require('node:path');
const ExcelJS = require('exceljs');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, '02-February -2026 Reconciled with bank.xlsx');
const OUT = path.resolve(
  __dirname,
  '..',
  'src',
  'bank-reconciliation',
  'templates',
  'reconciliation.xlsx',
);
const KEEP = 'Reconciled with bank与银行对账单核对一致 ';

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  for (const ws of [...wb.worksheets]) {
    if (ws.name !== KEEP) wb.removeWorksheet(ws.id);
  }
  const ws = wb.getWorksheet(KEEP);
  ws.name = 'Reconciliation';

  // Clear example data: period line, opening balance, and body rows 9-20 (A:F),
  // including the running-balance formulas (re-set per filled row at runtime).
  ws.getCell('A5').value = null;
  ws.getCell('C8').value = null;
  for (let r = 9; r <= 20; r++) {
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F']) {
      ws.getCell(`${col}${r}`).value = null;
    }
  }

  await wb.xlsx.writeFile(OUT);
  console.log('reconciliation.xlsx written; sheets:', wb.worksheets.map((w) => w.name));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
