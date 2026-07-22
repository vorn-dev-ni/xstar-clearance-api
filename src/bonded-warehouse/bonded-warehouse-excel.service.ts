import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBondedItemDto } from './dto/create-bonded-item.dto';
import { BondedWarehouseService } from './bonded-warehouse.service';

type FieldKey = keyof CreateBondedItemDto | 'releasedQty' | 'stockBalance';

interface ColumnSpec {
  header: string;
  field: FieldKey | null; // null = spacer / computed column (export only, ignored on import)
  type?: 'string' | 'int' | 'decimal' | 'date' | 'location';
}

/**
 * The "Stock Detail" columns in the client's template order. This single spec
 * drives both export (header + cell order) and import (header → field mapping).
 */
const STOCK_DETAIL_COLUMNS: ColumnSpec[] = [
  { header: 'Importer Name', field: 'importerName' },
  { header: 'SHIPPER Name', field: 'shipperName' },
  { header: 'Truck Bill/Bill of Lading/Airway Bill Number', field: 'blNumber' },
  { header: 'Invoice/Packing List Number', field: 'invoicePackingNumber' },
  { header: 'Port of Loading', field: 'portOfLoading' },
  { header: 'Port of Discharge/Transit Place', field: 'portOfDischarge' },
  { header: 'Container/Truck Number', field: 'containerTruckNumber' },
  { header: 'Container/Truck Type', field: 'containerTruckType' },
  { header: 'Brand Name', field: 'brandName' },
  { header: 'Description', field: 'description' },
  { header: 'Engine Capacity (CC / KW)', field: 'engineCapacity' },
  { header: 'Model Year', field: 'modelYear', type: 'int' },
  { header: 'COLOR', field: 'color' },
  { header: 'Country of Origin', field: 'countryOrigin' },
  { header: 'VIN#', field: 'vin' },
  { header: 'ENGINE#', field: 'engineNumber' },
  { header: "QTY' (UNIT)", field: 'quantity', type: 'int' },
  { header: 'Gross Weight (KGS)', field: 'grossWeightKg', type: 'decimal' },
  { header: 'Received Date In KWB', field: 'receivedDateKwb', type: 'date' },
  { header: 'TRANSFER/LOCATION UPDATE/OUTBOUND', field: null },
  { header: 'Current Location', field: 'currentLocationId', type: 'location' },
  { header: "Released QTY' (Unit)", field: 'releasedQty', type: 'int' },
  { header: 'Stock Balance (Unit)', field: 'stockBalance', type: 'int' },
  { header: 'Valid Days', field: 'validDays', type: 'int' },
  { header: 'ETA DATE', field: 'etaDate', type: 'date' },
  { header: 'SAD ID (IM8)', field: 'sadIdIm8' },
  { header: 'Transit Date', field: 'transitDate', type: 'date' },
  { header: 'SAD ID (IM7)', field: 'sadIdIm7' },
  { header: 'Inbound Date', field: 'inboundDate', type: 'date' },
  { header: 'Commodity Code', field: 'commodityCode' },
];

const SUMMARY_COLUMNS = [
  'Date',
  'B/L No.',
  'Invoice/Packing List Number',
  'Item Type / Product Category',
  'Total Quantity Received (Units)',
  'Quantity in KWB Warehouse (Units)',
  'Quantity in Showroom (Units)',
  'Quantity with Duty Paid (Units)',
  'Quantity with Duty Unpaid (Units)',
  'Number of Duty Suspension Days',
];

@Injectable()
export class BondedWarehouseExcelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bonded: BondedWarehouseService,
  ) {}

  /** Build a two-sheet workbook (Stock Detail + Stock Movement Summary). */
  async export(filter: {
    clearanceJobId?: string;
    blNumber?: string;
  }): Promise<Buffer> {
    const items = await this.prisma.bondedWarehouseItem.findMany({
      where: {
        clearanceJobId: filter.clearanceJobId,
        blNumber: filter.blNumber,
      },
      orderBy: [{ blNumber: 'asc' }, { receivedDateKwb: 'asc' }],
    });
    const summary = await this.bonded.summary(filter);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Clearance System';
    wb.created = new Date();

    const detail = wb.addWorksheet('Stock Detail');
    detail.addRow(STOCK_DETAIL_COLUMNS.map((c) => c.header));
    detail.getRow(1).font = { bold: true };
    for (const it of items) {
      detail.addRow(
        STOCK_DETAIL_COLUMNS.map((c) =>
          c.field ? ((it as Record<string, unknown>)[c.field] ?? null) : null,
        ),
      );
    }

    const sum = wb.addWorksheet('Stock Movement Summary');
    sum.addRow(SUMMARY_COLUMNS);
    sum.getRow(1).font = { bold: true };
    for (const r of summary) {
      sum.addRow([
        r.receivedDate,
        r.blNumber,
        r.invoicePackingNumber,
        r.itemType,
        r.totalReceived,
        r.qtyInKwb,
        r.qtyInShowroom,
        r.qtyDutyPaid,
        r.qtyDutyUnpaid,
        r.closed ? 'Closed' : r.dutySuspensionDays,
      ]);
    }

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Parse an uploaded template and create stock-detail items. Reads the
   * "Stock Detail" sheet (or the first sheet), mapping columns by header. Rows
   * without a B/L number are skipped.
   */
  async import(
    fileBuffer: Buffer,
    userId: string,
    clearanceJobId?: string,
  ): Promise<{ created: number; skipped: number }> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException('Could not read the Excel file');
    }
    const ws =
      wb.getWorksheet('Stock Detail') ??
      wb.worksheets.find((w) => /stock\s*detail/i.test(w.name)) ??
      wb.worksheets[0];
    if (!ws) throw new BadRequestException('No worksheet found in the file');

    // Header row → column index map (by normalized header text).
    const headerRow = ws.getRow(1);
    const colByField = new Map<FieldKey, number>();
    headerRow.eachCell((cell, colNumber) => {
      const norm = normalize(toStr(cell.value));
      const spec = STOCK_DETAIL_COLUMNS.find(
        (c) => c.field && normalize(c.header) === norm,
      );
      if (spec?.field) colByField.set(spec.field, colNumber);
    });
    const blCol = colByField.get('blNumber');
    if (!blCol) {
      throw new BadRequestException(
        'The file does not contain a recognizable "Bill of Lading" column',
      );
    }

    const specByField = new Map(
      STOCK_DETAIL_COLUMNS.filter((c) => c.field).map(
        (c) => [c.field as FieldKey, c] as const,
      ),
    );

    let created = 0;
    let skipped = 0;
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const blNumber = toStr(row.getCell(blCol).value).trim();
      if (!blNumber) {
        skipped++;
        continue;
      }
      const dto: Record<string, unknown> = { blNumber, clearanceJobId };
      for (const [field, colNumber] of colByField) {
        if (field === 'blNumber') continue;
        const spec = specByField.get(field);
        const value = coerce(row.getCell(colNumber).value, spec?.type);
        if (value !== null && value !== undefined) dto[field] = value;
      }
      // releasedQty/stockBalance are managed by the service; drop imported values.
      delete dto.releasedQty;
      delete dto.stockBalance;

      if (dto.currentLocationId) {
        const locName = dto.currentLocationId as string;
        let loc = await this.prisma.warehouseLocation.findUnique({
          where: { name: locName },
        });
        if (!loc)
          loc = await this.prisma.warehouseLocation.create({
            data: { name: locName },
          });
        dto.currentLocationId = loc.id;
      }

      await this.bonded.create(dto as unknown as CreateBondedItemDto, userId);
      created++;
    }
    return { created, skipped };
  }
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/['#]/g, '').trim().toLowerCase();
}

/** Safe string coercion for arbitrary Excel cell values (avoids [object Object]). */
function toStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint')
    return String(v);
  if (v instanceof Date) return v.toISOString();
  return '';
}

function coerce(value: ExcelJS.CellValue, type: ColumnSpec['type']): unknown {
  if (value == null || value === '') return null;
  // exceljs may wrap rich text / formula results
  const raw =
    typeof value === 'object' && value !== null
      ? 'result' in value
        ? (value as { result: unknown }).result
        : 'text' in value
          ? (value as { text: unknown }).text
          : value
      : value;
  if (raw == null || raw === '') return null;

  switch (type) {
    case 'int': {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case 'decimal': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'date': {
      if (raw instanceof Date) return raw.toISOString();
      const d = new Date(toStr(raw));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    case 'location': {
      const v = toStr(raw).trim().toUpperCase();
      if (v.includes('SHOWROOM')) return 'SHOWROOM';
      if (v.includes('RELEASE') || v.includes('OUTBOUND')) return 'RELEASED';
      if (v.includes('KWB')) return 'KWB';
      return v || null;
    }
    default:
      return toStr(raw).trim();
  }
}
