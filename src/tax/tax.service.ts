import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, FilingStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaxFilingDto } from './dto/create-tax-filing.dto';

@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateTaxFilingDto, userId: string) {
    try {
      const filing = await this.prisma.taxFilingRecord.create({ data: dto });
      await this.audit.log({
        userId,
        entityType: 'TaxFiling',
        entityId: filing.id,
        action: AuditAction.CREATE,
        after: {
          filingType: filing.filingType,
          filingPeriod: filing.filingPeriod,
        },
      });
      return {
        id: filing.id,
        filingType: filing.filingType,
        filingPeriod: filing.filingPeriod,
        taxAmount: Number(filing.taxAmount),
        status: filing.status,
        createdAt: filing.createdAt,
      };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'A filing for this type and period already exists',
        );
      }
      throw e;
    }
  }

  findAll() {
    return this.prisma.taxFilingRecord.findMany({
      orderBy: { filingPeriod: 'desc' },
    });
  }

  async submit(id: string, userId: string) {
    const filing = await this.prisma.taxFilingRecord.findUnique({
      where: { id },
    });
    if (!filing) throw new NotFoundException('Tax filing not found');
    if (filing.status !== FilingStatus.DRAFT) {
      throw new UnprocessableEntityException(
        `Only DRAFT filings can be submitted (current: ${filing.status})`,
      );
    }
    const receiptNumber = `TAX-${filing.filingPeriod}-${filing.id.slice(-3)}`;
    const updated = await this.prisma.taxFilingRecord.update({
      where: { id },
      data: {
        status: FilingStatus.FILED,
        filedDate: new Date(),
        receiptNumber,
      },
    });
    await this.audit.log({
      userId,
      entityType: 'TaxFiling',
      entityId: id,
      action: AuditAction.UPDATE,
      before: { status: filing.status },
      after: { status: updated.status },
    });
    return {
      id: updated.id,
      status: updated.status,
      filedDate: updated.filedDate,
      receiptNumber: updated.receiptNumber,
    };
  }
}
