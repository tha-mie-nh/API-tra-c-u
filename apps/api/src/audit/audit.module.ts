import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
