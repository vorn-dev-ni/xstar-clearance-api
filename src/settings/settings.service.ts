import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
import { UpdateTaxRateDto } from './dto/update-tax-rate.dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  // ---- Tax rates -------------------------------------------------------

  listTaxRates(includeInactive = false) {
    return this.prisma.taxRate.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { rate: 'asc' },
    });
  }

  /** Create a rate. When `isDefault`, demote every other rate in one transaction. */
  async createTaxRate(dto: CreateTaxRateDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.taxRate.updateMany({ data: { isDefault: false } });
      }
      return tx.taxRate.create({
        data: {
          label: dto.label,
          rate: dto.rate,
          isDefault: dto.isDefault ?? false,
          isActive: dto.isActive ?? true,
        },
      });
    });
  }

  async updateTaxRate(id: string, dto: UpdateTaxRateDto) {
    await this.getTaxRateOrThrow(id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.taxRate.updateMany({
          where: { id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.taxRate.update({ where: { id }, data: dto });
    });
  }

  /** Mark one rate as the single default. */
  async setDefaultTaxRate(id: string) {
    await this.getTaxRateOrThrow(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.taxRate.updateMany({
        where: { id: { not: id } },
        data: { isDefault: false },
      });
      return tx.taxRate.update({
        where: { id },
        data: { isDefault: true, isActive: true },
      });
    });
  }

  async removeTaxRate(id: string) {
    const rate = await this.getTaxRateOrThrow(id);
    if (rate.isDefault) {
      throw new UnprocessableEntityException(
        'Cannot delete the default tax rate — set another default first',
      );
    }
    await this.prisma.taxRate.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async getTaxRateOrThrow(id: string) {
    const rate = await this.prisma.taxRate.findUnique({ where: { id } });
    if (!rate) throw new NotFoundException('Tax rate not found');
    return rate;
  }

  // ---- Company settings ------------------------------------------------

  async getCompanySettings() {
    const settings = await this.prisma.companySettings.findFirst();
    if (!settings) {
      throw new NotFoundException('Company settings have not been configured');
    }
    return { ...settings, logoUrl: await this.resolveLogoUrl(settings.logo) };
  }

  async updateCompanySettings(dto: UpdateCompanySettingsDto) {
    const current = await this.getCompanySettings();
    // Empty-string logo clears the stored file reference.
    const data = { ...dto, logo: dto.logo === '' ? null : dto.logo };
    const updated = await this.prisma.companySettings.update({
      where: { id: current.id },
      data,
    });
    return { ...updated, logoUrl: await this.resolveLogoUrl(updated.logo) };
  }

  /** `logo` stores a FileUpload id; resolve it to a presigned GET URL for display. */
  private async resolveLogoUrl(logo: string | null): Promise<string | null> {
    if (!logo) return null;
    const file = await this.prisma.fileUpload.findUnique({
      where: { id: logo },
    });
    if (!file || file.status !== 'UPLOADED') return null;
    return this.s3.presignGet(file.key);
  }
}
