import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma 7 connects through a driver adapter instead of a bundled query engine.
 * We use the `pg` adapter (PrismaPg) so a single connection pool serves this
 * long-running Nest server — works with local Postgres and Neon alike.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    // Tune the pg connection pool (Neon pooled endpoint): fail fast instead of
    // hanging forever, keep the TCP socket warm so Neon doesn't drop it, and
    // recycle connections periodically. statement_timeout is opt-in because the
    // PgBouncer pooler can reject unknown startup params in transaction mode.
    const stmtTimeout = config.get<number>('DB_STATEMENT_TIMEOUT_MS') ?? 0;
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: config.get<number>('DB_POOL_MAX'),
      min: config.get<number>('DB_POOL_MIN'),
      idleTimeoutMillis: config.get<number>('DB_POOL_IDLE_TIMEOUT_MS'),
      connectionTimeoutMillis: config.get<number>('DB_CONNECT_TIMEOUT_MS'),
      maxUses: config.get<number>('DB_POOL_MAX_USES'),
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      allowExitOnIdle: false,
      application_name: 'clearance-backend',
      ...(stmtTimeout > 0 ? { statement_timeout: stmtTimeout } : {}),
    });
    super({ adapter, log: ['warn', 'error'] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to the database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
