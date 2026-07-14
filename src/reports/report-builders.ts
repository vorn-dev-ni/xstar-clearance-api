import {
  humanizeEnum,
  type ReportDocument,
  type ReportRowSpec,
  type ReportSection,
} from './report-document';

/** Company name and currency are filled in by the export service. */
export type ReportBody = Omit<ReportDocument, 'companyName' | 'currency'>;

interface ProfitLossData {
  reportPeriod: string;
  revenue: { byCategory: Record<string, number>; totalRevenue: number };
  expenses: { byCategory: Record<string, number>; totalExpenses: number };
  netProfit: number;
}

interface BalanceSheetData {
  reportDate: string;
  assets: { totalAssets: number; byAccount?: Record<string, number> };
  liabilities: { totalLiabilities: number; byAccount?: Record<string, number> };
  equity: {
    contributedEquity: number;
    retainedEarnings: number;
    totalEquity: number;
    byAccount?: Record<string, number>;
  };
  totalLiabilitiesAndEquity: number;
}

interface IncomeSummaryData {
  reportPeriod: string;
  summary: {
    customerName: string;
    transactions: number;
    totalAmount: number;
    percentage: number;
  }[];
  totalIncome: number;
}

interface ExpenseSummaryData {
  reportPeriod: string;
  summary: {
    expenseType: string;
    transactions: number;
    totalAmount: number;
    percentage: number;
  }[];
  totalExpenses: number;
}

interface TaxSummaryData {
  reportPeriod: string;
  taxableIncome: number;
  vatCollected: number;
  withholdingTax: number;
  nssf: number;
  totalTaxes: number;
  effectiveTaxRate: number;
}

interface AgingData {
  reportDate: string;
  buckets: {
    current: number;
    d1_30: number;
    d31_60: number;
    d61_90: number;
    d90_plus: number;
  };
  totalOutstanding: number;
  rows: {
    invoiceNumber: string;
    customerName: string;
    dueDate: Date;
    daysPastDue: number;
    balanceDue: number;
  }[];
}

function categoryRows(byCategory: Record<string, number>): ReportRowSpec[] {
  return Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, amount]) => ({
      label: humanizeEnum(cat),
      value: amount,
      indent: 1,
    }));
}

function buildProfitLoss(data: ProfitLossData): ReportBody {
  return {
    title: 'Profit & Loss Statement',
    periodLabel: `Period: ${data.reportPeriod}`,
    sections: [
      {
        kind: 'rows',
        heading: 'Revenue',
        rows: [
          ...categoryRows(data.revenue.byCategory),
          {
            label: 'Total Revenue',
            value: data.revenue.totalRevenue,
            bold: true,
          },
        ],
      },
      {
        kind: 'rows',
        heading: 'Expenses',
        rows: [
          ...categoryRows(data.expenses.byCategory),
          {
            label: 'Total Expenses',
            value: data.expenses.totalExpenses,
            bold: true,
          },
        ],
      },
      {
        kind: 'rows',
        rows: [{ label: 'Net Profit', value: data.netProfit, bold: true }],
      },
    ],
  };
}

function accountRows(map?: Record<string, number>): ReportRowSpec[] {
  if (!map) return [];
  return Object.entries(map).map(([label, value]) => ({
    label,
    value,
    indent: 1,
  }));
}

function buildBalanceSheet(data: BalanceSheetData): ReportBody {
  return {
    title: 'Balance Sheet',
    periodLabel: `As of ${data.reportDate}`,
    sections: [
      {
        kind: 'rows',
        heading: 'Assets',
        rows: [
          ...accountRows(data.assets.byAccount),
          { label: 'Total Assets', value: data.assets.totalAssets, bold: true },
        ],
      },
      {
        kind: 'rows',
        heading: 'Liabilities',
        rows: [
          ...accountRows(data.liabilities.byAccount),
          {
            label: 'Total Liabilities',
            value: data.liabilities.totalLiabilities,
            bold: true,
          },
        ],
      },
      {
        kind: 'rows',
        heading: 'Equity',
        rows: [
          ...accountRows(data.equity.byAccount),
          {
            label: 'Contributed Equity',
            value: data.equity.contributedEquity,
            indent: 1,
          },
          {
            label: 'Retained Earnings',
            value: data.equity.retainedEarnings,
            indent: 1,
          },
          { label: 'Total Equity', value: data.equity.totalEquity, bold: true },
        ],
      },
      {
        kind: 'rows',
        rows: [
          {
            label: 'Total Liabilities & Equity',
            value: data.totalLiabilitiesAndEquity,
            bold: true,
          },
        ],
      },
    ],
  };
}

function buildIncomeSummary(data: IncomeSummaryData): ReportBody {
  return {
    title: 'Income Summary',
    periodLabel: `Period: ${data.reportPeriod}`,
    sections: [
      {
        kind: 'table',
        heading: 'Income by Customer',
        columns: [
          { header: 'Customer', key: 'customer', width: 36 },
          {
            header: 'Transactions',
            key: 'transactions',
            width: 14,
            align: 'right',
            format: 'number',
          },
          {
            header: 'Amount',
            key: 'amount',
            width: 16,
            align: 'right',
            format: 'currency',
          },
          {
            header: '% of Total',
            key: 'percentage',
            width: 12,
            align: 'right',
            format: 'percent',
          },
        ],
        rows: data.summary.map((s) => ({
          customer: s.customerName,
          transactions: s.transactions,
          amount: s.totalAmount,
          percentage: s.percentage,
        })),
        totalRow: { customer: 'Total Income', amount: data.totalIncome },
      },
    ],
  };
}

function buildExpenseSummary(data: ExpenseSummaryData): ReportBody {
  return {
    title: 'Expense Summary',
    periodLabel: `Period: ${data.reportPeriod}`,
    sections: [
      {
        kind: 'table',
        heading: 'Expenses by Type',
        columns: [
          { header: 'Expense Type', key: 'type', width: 36 },
          {
            header: 'Transactions',
            key: 'transactions',
            width: 14,
            align: 'right',
            format: 'number',
          },
          {
            header: 'Amount',
            key: 'amount',
            width: 16,
            align: 'right',
            format: 'currency',
          },
          {
            header: '% of Total',
            key: 'percentage',
            width: 12,
            align: 'right',
            format: 'percent',
          },
        ],
        rows: data.summary.map((s) => ({
          type: humanizeEnum(s.expenseType),
          transactions: s.transactions,
          amount: s.totalAmount,
          percentage: s.percentage,
        })),
        totalRow: { type: 'Total Expenses', amount: data.totalExpenses },
      },
    ],
  };
}

function buildTaxSummary(data: TaxSummaryData): ReportBody {
  return {
    title: 'Tax Summary',
    periodLabel: `Period: ${data.reportPeriod}`,
    sections: [
      {
        kind: 'rows',
        heading: 'Tax Overview',
        rows: [
          { label: 'Taxable Income', value: data.taxableIncome },
          { label: 'VAT Collected', value: data.vatCollected, indent: 1 },
          { label: 'Withholding Tax', value: data.withholdingTax, indent: 1 },
          { label: 'NSSF Contribution', value: data.nssf, indent: 1 },
          { label: 'Total Taxes', value: data.totalTaxes, bold: true },
          {
            label: 'Effective Tax Rate',
            value: data.effectiveTaxRate,
            format: 'percent',
          },
        ],
      },
    ],
  };
}

function buildAging(data: AgingData): ReportBody {
  const bucketLabels: [keyof AgingData['buckets'], string][] = [
    ['current', 'Current (not yet due)'],
    ['d1_30', '1–30 Days Past Due'],
    ['d31_60', '31–60 Days Past Due'],
    ['d61_90', '61–90 Days Past Due'],
    ['d90_plus', 'Over 90 Days Past Due'],
  ];
  const sections: ReportSection[] = [
    {
      kind: 'rows',
      heading: 'Outstanding by Age',
      rows: [
        ...bucketLabels.map(([key, label]) => ({
          label,
          value: data.buckets[key],
          indent: 1,
        })),
        {
          label: 'Total Outstanding',
          value: data.totalOutstanding,
          bold: true,
        },
      ],
    },
  ];
  if (data.rows.length > 0) {
    sections.push({
      kind: 'table',
      heading: 'Open Invoices',
      columns: [
        { header: 'Invoice #', key: 'invoiceNumber', width: 16 },
        { header: 'Customer', key: 'customerName', width: 32 },
        { header: 'Due Date', key: 'dueDate', width: 12 },
        {
          header: 'Days Past Due',
          key: 'daysPastDue',
          width: 14,
          align: 'right',
          format: 'number',
        },
        {
          header: 'Balance Due',
          key: 'balanceDue',
          width: 16,
          align: 'right',
          format: 'currency',
        },
      ],
      rows: data.rows.map((r) => ({
        invoiceNumber: r.invoiceNumber,
        customerName: r.customerName,
        dueDate: r.dueDate.toISOString().slice(0, 10),
        daysPastDue: r.daysPastDue,
        balanceDue: r.balanceDue,
      })),
      totalRow: {
        customerName: 'Total Outstanding',
        balanceDue: data.totalOutstanding,
      },
    });
  }
  return {
    title: 'A/R Aging Analysis',
    periodLabel: `As of ${data.reportDate}`,
    sections,
  };
}

export const REPORT_BUILDERS: Record<string, (data: never) => ReportBody> = {
  'profit-loss': buildProfitLoss,
  'balance-sheet': buildBalanceSheet,
  'income-summary': buildIncomeSummary,
  'expense-summary': buildExpenseSummary,
  'tax-summary': buildTaxSummary,
  aging: buildAging,
};

export function buildReportDocument(slug: string, data: unknown): ReportBody {
  const builder = REPORT_BUILDERS[slug];
  if (!builder) throw new Error(`No report builder for: ${slug}`);
  return builder(data as never);
}
