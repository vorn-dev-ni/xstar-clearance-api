import { Injectable } from '@nestjs/common';
import {
  AccountType,
  EntryLineType,
  EntryStatus,
  FilingStatus,
  Prisma,
  TaxFilingType,
  TransactionStatus,
} from '@prisma/client';
import { monthYearRange } from '../common/date-range';
import { PrismaService } from '../prisma/prisma.service';
import {
  ExpenseSummaryQueryDto,
  IncomeSummaryQueryDto,
} from './dto/report-query.dto';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A single clickable line in P&L / Balance Sheet — one account's figure for the report. */
export interface ReportAccountLine {
  accountId: string;
  code: string;
  nameEn: string;
  category: string;
  amount: number;
}

const sortByCode = (arr: ReportAccountLine[]): ReportAccountLine[] =>
  arr.sort((a, b) => a.code.localeCompare(b.code));

function periodLabel(month?: number, year?: number): string {
  if (month && year) {
    const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en', {
      month: 'long',
      timeZone: 'UTC',
    });
    return `${name} ${year}`;
  }
  return year ? String(year) : 'All time';
}

/**
 * Match a report month/year against `TaxFilingRecord.filingPeriod` (a "YYYY-MM"
 * string): exact month → "2026-02"; year only → any period in that year; neither →
 * no filter (undefined leaves the where-clause key unconstrained).
 */
function filingPeriodFilter(
  month?: number,
  year?: number,
): string | Prisma.StringFilter | undefined {
  if (!year) return undefined;
  if (month) return `${year}-${String(month).padStart(2, '0')}`;
  return { startsWith: `${year}-` };
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * P&L from POSTED journal lines within the period. Returns per-account line items
   * (so the report can drill into each account's ledger) plus the category rollup and
   * totals. Revenue account amount = Σ(credit−debit); expense = Σ(debit−credit).
   */
  async profitLoss(month?: number, year?: number) {
    const range = monthYearRange(month, year);
    const lines = await this.prisma.journalEntryLine.findMany({
      where: { entry: { status: EntryStatus.POSTED, entryDate: range } },
      include: {
        account: {
          select: {
            id: true,
            code: true,
            nameEn: true,
            type: true,
            category: true,
          },
        },
      },
    });

    const revenueByCat: Record<string, number> = {};
    const expenseByCat: Record<string, number> = {};
    const revenueAcc = new Map<string, ReportAccountLine>();
    const expenseAcc = new Map<string, ReportAccountLine>();
    let totalRevenue = 0;
    let totalExpenses = 0;

    const bump = (
      map: Map<string, ReportAccountLine>,
      a: { id: string; code: string; nameEn: string; category: string },
      net: number,
    ) => {
      const cur =
        map.get(a.id) ??
        ({
          accountId: a.id,
          code: a.code,
          nameEn: a.nameEn,
          category: a.category,
          amount: 0,
        } satisfies ReportAccountLine);
      cur.amount = round2(cur.amount + net);
      map.set(a.id, cur);
    };

    for (const l of lines) {
      const amt = Number(l.amount);
      const a = l.account;
      const cat = a.category;
      if (a.type === AccountType.REVENUE) {
        const net = l.entryType === EntryLineType.CREDIT ? amt : -amt;
        revenueByCat[cat] = round2((revenueByCat[cat] ?? 0) + net);
        totalRevenue = round2(totalRevenue + net);
        bump(revenueAcc, a, net);
      } else if (a.type === AccountType.EXPENSE) {
        const net = l.entryType === EntryLineType.DEBIT ? amt : -amt;
        expenseByCat[cat] = round2((expenseByCat[cat] ?? 0) + net);
        totalExpenses = round2(totalExpenses + net);
        bump(expenseAcc, a, net);
      }
    }

    return {
      reportType: 'PROFIT_LOSS',
      reportPeriod: periodLabel(month, year),
      revenue: {
        accounts: sortByCode([...revenueAcc.values()]),
        byCategory: revenueByCat,
        totalRevenue,
      },
      expenses: {
        accounts: sortByCode([...expenseAcc.values()]),
        byCategory: expenseByCat,
        totalExpenses,
      },
      netProfit: round2(totalRevenue - totalExpenses),
    };
  }

  /** Balance sheet from current account balances (snapshot), listed per account. */
  async balanceSheet(date?: string) {
    const accounts = await this.prisma.account.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        nameEn: true,
        category: true,
        type: true,
        balance: true,
      },
      orderBy: { code: 'asc' },
    });

    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    const assetsAcc: ReportAccountLine[] = [];
    const liabilitiesAcc: ReportAccountLine[] = [];
    const equityAcc: ReportAccountLine[] = [];

    for (const a of accounts) {
      const bal = round2(Number(a.balance));
      const line: ReportAccountLine = {
        accountId: a.id,
        code: a.code,
        nameEn: a.nameEn,
        category: a.category,
        amount: bal,
      };
      if (a.type === AccountType.ASSET || a.type === AccountType.BANK) {
        assets = round2(assets + bal);
        assetsAcc.push(line);
      } else if (a.type === AccountType.LIABILITY) {
        liabilities = round2(liabilities + bal);
        liabilitiesAcc.push(line);
      } else if (a.type === AccountType.EQUITY) {
        equity = round2(equity + bal);
        equityAcc.push(line);
      }
    }
    // Retained earnings balances the sheet (assets = liabilities + equity).
    const retainedEarnings = round2(assets - liabilities - equity);

    return {
      reportType: 'BALANCE_SHEET',
      reportDate: date ?? new Date().toISOString().slice(0, 10),
      assets: { totalAssets: assets, accounts: assetsAcc },
      liabilities: {
        totalLiabilities: liabilities,
        accounts: liabilitiesAcc,
      },
      equity: {
        contributedEquity: equity,
        retainedEarnings,
        totalEquity: round2(equity + retainedEarnings),
        accounts: equityAcc,
      },
      totalLiabilitiesAndEquity: round2(
        liabilities + equity + retainedEarnings,
      ),
    };
  }

  /** Monthly revenue/expense totals for a year (dashboard chart). */
  async monthlyTrend(year: number) {
    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        entry: {
          status: EntryStatus.POSTED,
          entryDate: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lt: new Date(Date.UTC(year + 1, 0, 1)),
          },
        },
      },
      include: {
        entry: { select: { entryDate: true } },
        account: { select: { type: true } },
      },
    });

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      revenue: 0,
      expenses: 0,
      netProfit: 0,
    }));

    for (const l of lines) {
      const bucket = months[l.entry.entryDate.getUTCMonth()];
      const amt = Number(l.amount);
      if (l.account.type === AccountType.REVENUE) {
        bucket.revenue = round2(
          bucket.revenue + (l.entryType === EntryLineType.CREDIT ? amt : -amt),
        );
      } else if (l.account.type === AccountType.EXPENSE) {
        bucket.expenses = round2(
          bucket.expenses + (l.entryType === EntryLineType.DEBIT ? amt : -amt),
        );
      }
    }
    for (const m of months) m.netProfit = round2(m.revenue - m.expenses);

    return { year, months };
  }

  /** Income totals grouped by customer for the period, optionally filtered. */
  async incomeSummary(q: IncomeSummaryQueryDto = {}) {
    const range = monthYearRange(q.month, q.year);
    const where: Prisma.IncomeRecordWhereInput = {
      status: TransactionStatus.POSTED,
      recordDate: range,
      customerId: q.customerId,
      serviceType: q.serviceType,
      ...(q.search
        ? {
            OR: [
              { recordNumber: { contains: q.search, mode: 'insensitive' } },
              { description: { contains: q.search, mode: 'insensitive' } },
              { invoiceNumber: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const grouped = await this.prisma.incomeRecord.groupBy({
      by: ['customerId'],
      where,
      _sum: { amount: true },
      _count: true,
    });
    const totalIncome = round2(
      grouped.reduce((acc, g) => acc + Number(g._sum.amount ?? 0), 0),
    );
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: grouped.map((g) => g.customerId) } },
      select: { id: true, nameEn: true },
    });
    const nameById = new Map(customers.map((c) => [c.id, c.nameEn]));

    const summary = grouped
      .map((g) => {
        const amount = round2(Number(g._sum.amount ?? 0));
        return {
          customerId: g.customerId,
          customerName: nameById.get(g.customerId) ?? 'Unknown',
          transactions: g._count,
          totalAmount: amount,
          percentage: totalIncome ? round2((amount / totalIncome) * 100) : 0,
        };
      })
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return {
      reportType: 'INCOME_SUMMARY',
      reportPeriod: periodLabel(q.month, q.year),
      summary,
      totalIncome,
    };
  }

  async taxSummary(month?: number, year?: number) {
    const range = monthYearRange(month, year);
    // Withholding & NSSF come from filed returns (TaxFilingRecord), matched by the
    // report period against `filingPeriod` ("YYYY-MM"). Any status except REJECTED
    // counts, so draft filings still surface.
    const filingPeriod = filingPeriodFilter(month, year);
    const [income, invoiceVat, withholding, nssf] = await Promise.all([
      this.prisma.incomeRecord.aggregate({
        where: { status: TransactionStatus.POSTED, recordDate: range },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { invoiceDate: range, status: { not: 'DRAFT' } },
        _sum: { taxAmount: true },
      }),
      this.prisma.taxFilingRecord.aggregate({
        where: {
          filingType: TaxFilingType.WITHHOLDING_TAX,
          status: { not: FilingStatus.REJECTED },
          filingPeriod,
        },
        _sum: { taxAmount: true },
      }),
      this.prisma.taxFilingRecord.aggregate({
        where: {
          filingType: TaxFilingType.NSSF,
          status: { not: FilingStatus.REJECTED },
          filingPeriod,
        },
        _sum: { taxAmount: true },
      }),
    ]);

    const taxableIncome = round2(Number(income._sum.amount ?? 0));
    const vatCollected = round2(Number(invoiceVat._sum.taxAmount ?? 0));
    const withholdingTax = round2(Number(withholding._sum.taxAmount ?? 0));
    const nssfAmount = round2(Number(nssf._sum.taxAmount ?? 0));
    const totalTaxes = round2(vatCollected + withholdingTax + nssfAmount);

    return {
      reportType: 'TAX_SUMMARY',
      reportPeriod: periodLabel(month, year),
      taxableIncome,
      vatCollected,
      withholdingTax,
      nssf: nssfAmount,
      totalTaxes,
      effectiveTaxRate: taxableIncome
        ? round2((totalTaxes / taxableIncome) * 100)
        : 0,
    };
  }

  /** Expense totals grouped by expense type for the period, optionally filtered. */
  async expenseSummary(q: ExpenseSummaryQueryDto = {}) {
    const range = monthYearRange(q.month, q.year);
    const where: Prisma.ExpenseRecordWhereInput = {
      status: TransactionStatus.POSTED,
      recordDate: range,
      supplierId: q.supplierId,
      expenseType: q.expenseType,
      ...(q.search
        ? {
            OR: [
              { recordNumber: { contains: q.search, mode: 'insensitive' } },
              { description: { contains: q.search, mode: 'insensitive' } },
              { invoiceNumber: { contains: q.search, mode: 'insensitive' } },
              { supplierName: { contains: q.search, mode: 'insensitive' } },
              {
                supplier: {
                  nameEn: { contains: q.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const grouped = await this.prisma.expenseRecord.groupBy({
      by: ['expenseType'],
      where,
      _sum: { amount: true },
      _count: true,
    });
    const totalExpenses = round2(
      grouped.reduce((acc, g) => acc + Number(g._sum.amount ?? 0), 0),
    );
    const summary = grouped
      .map((g) => {
        const amount = round2(Number(g._sum.amount ?? 0));
        return {
          expenseType: g.expenseType,
          transactions: g._count,
          totalAmount: amount,
          percentage: totalExpenses
            ? round2((amount / totalExpenses) * 100)
            : 0,
        };
      })
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return {
      reportType: 'EXPENSE_SUMMARY',
      reportPeriod: periodLabel(q.month, q.year),
      summary,
      totalExpenses,
    };
  }

  /** A/R aging: outstanding invoice balances bucketed by days past due date. */
  async aging() {
    const invoices = await this.prisma.invoice.findMany({
      where: { status: { not: 'DRAFT' }, balanceDue: { gt: 0 } },
      select: {
        invoiceNumber: true,
        dueDate: true,
        invoiceDate: true,
        balanceDue: true,
        customer: { select: { nameEn: true } },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    const now = Date.now();
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    const rows = invoices.map((inv) => {
      const due = inv.dueDate ?? inv.invoiceDate;
      const daysPastDue = Math.floor((now - due.getTime()) / 86_400_000);
      const balance = round2(Number(inv.balanceDue));
      const bucket: keyof typeof buckets =
        daysPastDue <= 0
          ? 'current'
          : daysPastDue <= 30
            ? 'd1_30'
            : daysPastDue <= 60
              ? 'd31_60'
              : daysPastDue <= 90
                ? 'd61_90'
                : 'd90_plus';
      buckets[bucket] = round2(buckets[bucket] + balance);
      return {
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer?.nameEn ?? 'Unknown',
        dueDate: due,
        daysPastDue: Math.max(0, daysPastDue),
        balanceDue: balance,
        bucket,
      };
    });

    return {
      reportType: 'AGING',
      reportDate: new Date().toISOString().slice(0, 10),
      buckets,
      totalOutstanding: round2(
        Object.values(buckets).reduce((a, b) => a + b, 0),
      ),
      rows,
    };
  }
}
