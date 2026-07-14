import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FilingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaxFilingDto } from './dto/create-tax-filing.dto';

@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTaxFilingDto) {
    try {
      const filing = await this.prisma.taxFilingRecord.create({ data: dto });
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

  async submit(id: string) {
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
    return {
      id: updated.id,
      status: updated.status,
      filedDate: updated.filedDate,
      receiptNumber: updated.receiptNumber,
    };
  }
}
