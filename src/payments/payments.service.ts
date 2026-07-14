import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginationMeta, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { ListPaymentsDto } from './dto/list-payments.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** All recorded payments (across invoices), newest first, with invoice + customer. */
  async findAll(query: ListPaymentsDto) {
    const where: Prisma.PaymentWhereInput = {
      method: query.method,
      invoiceId: query.invoiceId,
    };
    const { skip, take } = toSkipTake(query.page, query.limit);
    const [rows, total, agg] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              customer: { select: { nameEn: true } },
            },
          },
        },
        orderBy: { paymentDate: 'desc' },
        skip,
        take,
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      data: rows,
      pagination: paginationMeta(total, query.page, query.limit),
      summary: { totalReceived: Number(agg._sum.amount ?? 0) },
    };
  }
}
