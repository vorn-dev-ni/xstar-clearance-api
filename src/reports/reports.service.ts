import { Injectable } from '@nestjs/common';
import {
  AccountType,
  EntryLineType,
  EntryStatus,
  ExpenseType,
  TransactionStatus,
} from '@prisma/client';
import { monthYearRange } from '../common/date-range';
import { PrismaService } from '../prisma/prisma.service';

const round2 = (n: number): number => Math.round(n * 100) / 100;

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

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** P&L from POSTED journal lines within the period, grouped by account category. */
  async profitLoss(month?: number, year?: number) {
    const range = monthYearRange(month, year);
    const lines = await this.prisma.journalEntryLine.findMany({
      where: { entry: { status: EntryStatus.POSTED, entryDate: range } },
      include: { account: { select: { type: true, category: true } } },
    });

    const revenueByCat: Record<string, number> = {};
    const expenseByCat: Record<string, number> = {};
    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const l of lines) {
      const amt = Number(l.amount);
      const cat = l.account.category;
      if (l.account.type === AccountType.REVENUE) {
        const net = l.entryType === EntryLineType.CREDIT ? amt : -amt;
        revenueByCat[cat] = round2((revenueByCat[cat] ?? 0) + net);
        totalRevenue = round2(totalRevenue + net);
      } else if (l.account.type === AccountType.EXPENSE) {
        const net = l.entryType === EntryLineType.DEBIT ? amt : -amt;
        expenseByCat[cat] = round2((expenseByCat[cat] ?? 0) + net);
        totalExpenses = round2(totalExpenses + net);
      }
    }

    return {
      reportType: 'PROFIT_LOSS',
      reportPeriod: periodLabel(month, year),
      revenue: { byCategory: revenueByCat, totalRevenue },
      expenses: { byCategory: expenseByCat, totalExpenses },
      netProfit: round2(totalRevenue - totalExpenses),
    };
  }

  /** Balance sheet from current account balances (snapshot). */
  async balanceSheet(date?: string) {
    const accounts = await this.prisma.account.findMany({
      where: { isActive: true },
      select: { type: true, balance: true },
    });

    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    for (const a of accounts) {
      const bal = Number(a.balance);
      if (a.type === AccountType.ASSET || a.type === AccountType.BANK) {
        assets = round2(assets + bal);
      } else if (a.type === AccountType.LIABILITY) {
        liabilities = round2(liabilities + bal);
      } else if (a.type === AccountType.EQUITY) {
        equity = round2(equity + bal);
      }
    }
    // Retained earnings balances the sheet (assets = liabilities + equity).
    const retainedEarnings = round2(assets - liabilities - equity);

    return {
      reportType: 'BALANCE_SHEET',
      reportDate: date ?? new Date().toISOString().slice(0, 10),
      assets: { totalAssets: assets },
      liabilities: { totalLiabilities: liabilities },
      equity: {
        contributedEquity: equity,
        retainedEarnings,
        totalEquity: round2(equity + retainedEarnings),
      },
      totalLiabilitiesAndEquity: round2(
        liabilities + equity + retainedEarnings,
      ),
    };
  }

  /** Income totals grouped by customer for the period. */
  async incomeSummary(month?: number, year?: number) {
    const range = monthYearRange(month, year);
    const grouped = await this.prisma.incomeRecord.groupBy({
      by: ['customerId'],
      where: { status: TransactionStatus.POSTED, recordDate: range },
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
      reportPeriod: periodLabel(month, year),
      summary,
      totalIncome,
    };
  }

  async taxSummary(month?: number, year?: number) {
    const range = monthYearRange(month, year);
    const [income, invoiceVat, withholding, nssf] = await Promise.all([
      this.prisma.incomeRecord.aggregate({
        where: { status: TransactionStatus.POSTED, recordDate: range },
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { invoiceDate: range, status: { not: 'DRAFT' } },
        _sum: { taxAmount: true },
      }),
      this.prisma.expenseRecord.aggregate({
        where: { recordDate: range, expenseType: ExpenseType.WITHHOLDING_TAX },
        _sum: { amount: true },
      }),
      this.prisma.expenseRecord.aggregate({
        where: {
          recordDate: range,
          expenseType: ExpenseType.NSSF_CONTRIBUTION,
        },
        _sum: { amount: true },
      }),
    ]);

    const taxableIncome = round2(Number(income._sum.amount ?? 0));
    const vatCollected = round2(Number(invoiceVat._sum.taxAmount ?? 0));
    const withholdingTax = round2(Number(withholding._sum.amount ?? 0));
    const nssfAmount = round2(Number(nssf._sum.amount ?? 0));
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

  /** Expense totals grouped by expense type for the period. */
  async expenseSummary(month?: number, year?: number) {
    const range = monthYearRange(month, year);
    const grouped = await this.prisma.expenseRecord.groupBy({
      by: ['expenseType'],
      where: { status: TransactionStatus.POSTED, recordDate: range },
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
      reportPeriod: periodLabel(month, year),
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
