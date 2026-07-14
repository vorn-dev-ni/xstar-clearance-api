import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccountsModule } from './accounts/accounts.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { validate, type Env } from './config/env.validation';
import { CustomersModule } from './customers/customers.module';
import { DepositsModule } from './deposits/deposits.module';
import { ExpenseModule } from './expense/expense.module';
import { HealthModule } from './health/health.module';
import { IncomeModule } from './income/income.module';
import { InvoicesModule } from './invoices/invoices.module';
import { JournalModule } from './journal/journal.module';
import { OperationsModule } from './operations/operations.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TaxModule } from './tax/tax.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Select the env file by NODE_ENV (.env.development / .env.production).
      envFilePath: `.env.${process.env.NODE_ENV ?? 'development'}`,
      validate,
    }),
    // Global per-IP rate limiting; enforced by the ThrottlerGuard in CommonModule.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL', { infer: true }),
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
      }),
    }),
    PrismaModule,
    CommonModule,
    AuthModule,
    HealthModule,
    CustomersModule,
    SuppliersModule,
    AccountsModule,
    JournalModule,
    IncomeModule,
    ExpenseModule,
    InvoicesModule,
    ReportsModule,
    TaxModule,
    AuditModule,
    DepositsModule,
    UploadsModule,
    SettingsModule,
    PaymentsModule,
    UsersModule,
    OperationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
