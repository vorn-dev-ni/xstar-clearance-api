import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuditService } from '../audit/audit.service';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { RecordNumberService } from './record-number.service';

/**
 * Cross-cutting providers available everywhere without re-importing:
 * the record-number formatter and the audit-trail writer. Also registers the
 * global exception filter that shapes the standard error envelope.
 */
@Global()
@Module({
  providers: [
    RecordNumberService,
    AuditService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Registered here (before AuthModule) so rate limiting rejects floods
    // with 429 before any JWT verification runs.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [RecordNumberService, AuditService],
})
export class CommonModule {}
