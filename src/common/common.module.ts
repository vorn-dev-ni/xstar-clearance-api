import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
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
  ],
  exports: [RecordNumberService, AuditService],
})
export class CommonModule {}
