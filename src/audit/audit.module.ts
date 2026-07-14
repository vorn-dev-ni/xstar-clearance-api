import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';

// AuditService is provided globally by CommonModule; this module only exposes
// the read API for audit logs.
@Module({
  controllers: [AuditController],
})
export class AuditModule {}
