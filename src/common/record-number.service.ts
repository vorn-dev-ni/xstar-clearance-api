import { Injectable } from '@nestjs/common';

/**
 * Formats sequential, human-readable record numbers like `INC-2026-0001`,
 * `EXP-2026-0042`, `JE-2026-0007`, `PMT-2026-0003`. The sequence is derived by
 * the caller (a per-year row count taken inside the same transaction), keeping
 * numbering collision-safe under concurrent writes.
 */
@Injectable()
export class RecordNumberService {
  format(
    prefix: string,
    seq: number,
    year = new Date().getFullYear(),
    pad = 4,
  ): string {
    return `${prefix}-${year}-${String(seq).padStart(pad, '0')}`;
  }

  /** Invoice numbers follow `ST25-000028` (2-digit year, 6-digit sequence). */
  formatInvoice(seq: number, year = new Date().getFullYear()): string {
    const yy = String(year).slice(-2);
    return `ST${yy}-${String(seq).padStart(6, '0')}`;
  }
}
