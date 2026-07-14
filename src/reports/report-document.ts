/**
 * Presentation-ready report spec shared by the PDF and Excel writers.
 * Builders in report-builders.ts map raw ReportsService results into this
 * shape so both formats render identical, human-labelled content.
 */
export type ValueFormat = 'currency' | 'percent' | 'number' | 'text' | 'date';

export interface ReportRowSpec {
  label: string;
  value: string | number;
  /** Subtotal / total lines: bold with a rule above. */
  bold?: boolean;
  /** 0 = flush with the section, 1+ = indented detail line. */
  indent?: number;
  /** Defaults to 'currency' for numbers, 'text' for strings. */
  format?: ValueFormat;
}

export interface ReportColumnSpec {
  header: string;
  key: string;
  /** Excel column width (characters). */
  width?: number;
  align?: 'left' | 'right';
  format?: ValueFormat;
}

export type ReportSection =
  | { kind: 'rows'; heading?: string; rows: ReportRowSpec[] }
  | {
      kind: 'table';
      heading?: string;
      columns: ReportColumnSpec[];
      rows: Record<string, unknown>[];
      totalRow?: Record<string, unknown>;
    };

export interface ReportDocument {
  /** Human title, e.g. "Balance Sheet". */
  title: string;
  companyName: string;
  /** "Period: June 2026" / "As of 2026-07-14" — rendered under the title. */
  periodLabel: string;
  currency: string;
  sections: ReportSection[];
}

/** "WITHHOLDING_TAX" → "Withholding Tax" */
export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatValue(
  value: string | number,
  format: ValueFormat | undefined,
  currency: string,
): string {
  if (typeof value !== 'number') return String(value);
  const fmt = format ?? 'currency';
  switch (fmt) {
    case 'currency':
      return `${value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${currency}`;
    case 'percent':
      return `${value.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`;
    case 'number':
      return value.toLocaleString('en-US');
    default:
      return String(value);
  }
}
