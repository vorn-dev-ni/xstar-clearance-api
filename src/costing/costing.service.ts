import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AuditAction,
  ExpenseType,
  Prisma,
  ServiceType,
  TransactionStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ACCOUNT_CODES } from '../common/accounting.constants';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { ExpenseService } from '../expense/expense.service';
import { IncomeService } from '../income/income.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCostLineDto } from './dto/create-cost-line.dto';
import { CreateIncomeLineDto } from './dto/create-income-line.dto';
import { ListCostingDto } from './dto/list-costing.dto';
import { UpdateCostLineDto } from './dto/update-cost-line.dto';
import { UpdateIncomeLineDto } from './dto/update-income-line.dto';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Actual cost per row = Amount + Tax − Deposit (stored value preferred). */
function rowActualCost(r: {
  amount: Prisma.Decimal;
  taxAmount: Prisma.Decimal | null;
  deposit: Prisma.Decimal | null;
  actualCost: Prisma.Decimal | null;
}): number {
  return r.actualCost != null
    ? Number(r.actualCost)
    : Number(r.amount) + Number(r.taxAmount ?? 0) - Number(r.deposit ?? 0);
}

/**
 * B/L Costing: a per-Bill-of-Lading lens over the accounting ledger. Cost lines
 * are unposted ExpenseRecords, income lines unposted IncomeRecords, both keyed
 * by the clearance job. Profit = Σ income − Σ actual cost.
 */
@Injectable()
export class CostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expense: ExpenseService,
    private readonly income: IncomeService,
    private readonly audit: AuditService,
  ) {}

  /** List B/Ls (clearance jobs) with cost/income/profit roll-ups. */
  async listBls(query: ListCostingDto) {
    const where: Prisma.ClearanceJobWhereInput = query.search
      ? {
          OR: [
            { jobNumber: { contains: query.search, mode: 'insensitive' } },
            {
              blBookingNumber: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
          ],
        }
      : {};
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [jobs, total] = await this.prisma.$transaction([
      this.prisma.clearanceJob.findMany({
        where,
        select: {
          id: true,
          jobNumber: true,
          blBookingNumber: true,
          customerName: true,
          customer: { select: { nameEn: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      this.prisma.clearanceJob.count({ where }),
    ]);

    const jobIds = jobs.map((j) => j.id);
    const [expenses, incomes] = await this.prisma.$transaction([
      this.prisma.expenseRecord.findMany({
        where: { clearanceJobId: { in: jobIds } },
        select: {
          clearanceJobId: true,
          amount: true,
          taxAmount: true,
          deposit: true,
          actualCost: true,
        },
      }),
      this.prisma.incomeRecord.findMany({
        where: { clearanceJobId: { in: jobIds } },
        select: { clearanceJobId: true, amount: true },
      }),
    ]);

    const costByJob = new Map<string, number>();
    for (const e of expenses) {
      if (!e.clearanceJobId) continue;
      costByJob.set(
        e.clearanceJobId,
        (costByJob.get(e.clearanceJobId) ?? 0) + rowActualCost(e),
      );
    }
    const incomeByJob = new Map<string, number>();
    for (const i of incomes) {
      if (!i.clearanceJobId) continue;
      incomeByJob.set(
        i.clearanceJobId,
        (incomeByJob.get(i.clearanceJobId) ?? 0) + Number(i.amount),
      );
    }

    const data = jobs.map((j) => {
      const totalCost = round2(costByJob.get(j.id) ?? 0);
      const totalIncome = round2(incomeByJob.get(j.id) ?? 0);
      return {
        jobId: j.id,
        jobNumber: j.jobNumber,
        blBookingNumber: j.blBookingNumber,
        customerName: j.customerName ?? j.customer?.nameEn ?? null,
        totalCost,
        totalIncome,
        profit: round2(totalIncome - totalCost),
      };
    });

    return {
      data,
      pagination: paginationMeta(total, query.page, query.limit),
    };
  }

  /** The three-part statement (cost · income · profit) for one B/L. */
  async getStatement(jobId: string) {
    const job = await this.prisma.clearanceJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        jobNumber: true,
        blBookingNumber: true,
        customerName: true,
        customer: { select: { nameEn: true } },
      },
    });
    if (!job) throw new NotFoundException('Clearance job not found');

    const [expenses, incomes] = await this.prisma.$transaction([
      this.prisma.expenseRecord.findMany({
        where: { clearanceJobId: jobId },
        include: { supplier: { select: { nameEn: true } } },
        orderBy: { recordDate: 'asc' },
      }),
      this.prisma.incomeRecord.findMany({
        where: { clearanceJobId: jobId },
        orderBy: { recordDate: 'asc' },
      }),
    ]);

    const costLines = expenses.map((e) => ({
      id: e.id,
      recordNumber: e.recordNumber,
      date: e.recordDate,
      payeeName: e.supplierName ?? e.supplier?.nameEn ?? null,
      invoiceNumber: e.invoiceNumber,
      description: e.description,
      amount: Number(e.amount),
      tax: Number(e.taxAmount ?? 0),
      deposit: Number(e.deposit ?? 0),
      actualCost: round2(rowActualCost(e)),
      notes: e.notes,
      status: e.status,
    }));
    const incomeLines = incomes.map((i) => ({
      id: i.id,
      recordNumber: i.recordNumber,
      date: i.recordDate,
      receivedFromName: i.receivedFromName,
      invoiceNumber: i.invoiceNumber,
      description: i.description,
      amount: Number(i.amount),
      notes: i.notes,
      status: i.status,
    }));

    const totalCost = round2(costLines.reduce((s, l) => s + l.actualCost, 0));
    const totalIncome = round2(incomeLines.reduce((s, l) => s + l.amount, 0));

    return {
      job: {
        jobId: job.id,
        jobNumber: job.jobNumber,
        blBookingNumber: job.blBookingNumber,
        customerName: job.customerName ?? job.customer?.nameEn ?? null,
      },
      costLines,
      incomeLines,
      totals: {
        totalCost,
        totalIncome,
        profit: round2(totalIncome - totalCost),
      },
    };
  }

  // ---- Cost lines (ExpenseRecord) ----------------------------------------

  async addCostLine(jobId: string, dto: CreateCostLineDto, userId: string) {
    await this.requireJob(jobId);
    const accountId = await this.accountIdByCode(ACCOUNT_CODES.COSTING_EXPENSE);
    return this.expense.create(
      {
        recordDate: dto.date,
        description: dto.description,
        expenseType: ExpenseType.OTHER,
        supplierName: dto.payeeName,
        clearanceJobId: jobId,
        amount: dto.amount,
        accountId,
        taxAmount: dto.tax,
        deposit: dto.deposit,
        invoiceNumber: dto.invoiceNumber,
        notes: dto.notes,
      },
      userId,
    );
  }

  updateCostLine(id: string, dto: UpdateCostLineDto, userId: string) {
    return this.expense.update(
      id,
      {
        recordDate: dto.date,
        description: dto.description,
        supplierName: dto.payeeName,
        amount: dto.amount,
        taxAmount: dto.tax,
        deposit: dto.deposit,
        invoiceNumber: dto.invoiceNumber,
        notes: dto.notes,
      },
      userId,
    );
  }

  async deleteCostLine(id: string, userId: string) {
    const record = await this.prisma.expenseRecord.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Cost line not found');
    if (record.status === TransactionStatus.POSTED) {
      throw new UnprocessableEntityException(
        'Posted cost lines cannot be deleted',
      );
    }
    await this.prisma.expenseRecord.delete({ where: { id } });
    await this.audit.log({
      userId,
      entityType: 'ExpenseRecord',
      entityId: id,
      action: AuditAction.DELETE,
      before: { amount: Number(record.amount) },
    });
    return { id, deleted: true };
  }

  // ---- Income lines (IncomeRecord) ---------------------------------------

  async addIncomeLine(jobId: string, dto: CreateIncomeLineDto, userId: string) {
    const job = await this.requireJob(jobId);
    const accountId = await this.accountIdByCode(
      ACCOUNT_CODES.OPERATION_REVENUE,
    );
    return this.income.create(
      {
        recordDate: dto.date,
        description: dto.description,
        serviceType: ServiceType.OTHER,
        customerId: job.customerId,
        clearanceJobId: jobId,
        amount: dto.amount,
        accountId,
        invoiceNumber: dto.invoiceNumber,
        billNumber: job.blBookingNumber ?? undefined,
        receivedFromName: dto.receivedFromName,
        notes: dto.notes,
      },
      userId,
    );
  }

  updateIncomeLine(id: string, dto: UpdateIncomeLineDto, userId: string) {
    return this.income.update(
      id,
      {
        recordDate: dto.date,
        description: dto.description,
        amount: dto.amount,
        invoiceNumber: dto.invoiceNumber,
        receivedFromName: dto.receivedFromName,
        notes: dto.notes,
      },
      userId,
    );
  }

  async deleteIncomeLine(id: string, userId: string) {
    const record = await this.prisma.incomeRecord.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Income line not found');
    if (record.status === TransactionStatus.POSTED) {
      throw new UnprocessableEntityException(
        'Posted income lines cannot be deleted',
      );
    }
    await this.prisma.incomeRecord.delete({ where: { id } });
    await this.audit.log({
      userId,
      entityType: 'IncomeRecord',
      entityId: id,
      action: AuditAction.DELETE,
      before: { amount: Number(record.amount) },
    });
    return { id, deleted: true };
  }

  // ---- helpers -----------------------------------------------------------

  private async requireJob(jobId: string) {
    const job = await this.prisma.clearanceJob.findUnique({
      where: { id: jobId },
      select: { id: true, customerId: true, blBookingNumber: true },
    });
    if (!job) throw new NotFoundException('Clearance job not found');
    return job;
  }

  private async accountIdByCode(code: string): Promise<string> {
    const account = await this.prisma.account.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!account) {
      throw new UnprocessableEntityException(
        `Default account ${code} is not configured in the chart of accounts`,
      );
    }
    return account.id;
  }
}
