import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tap, type Observable } from 'rxjs';
import type { Request } from 'express';
import { AUDIT_ACTION_KEY, type AuditActionMeta } from './audit-action.decorator';
import { AuditService } from './audit.service';

/**
 * Cross-cutting audit writer (Key Insight: an Interceptor, not audit calls
 * sprinkled through every service). Global, but a no-op unless the route
 * carries @AuditAction() — cheap for the ~95% of routes that aren't admin
 * mutations.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditActionMeta | undefined>(AUDIT_ACTION_KEY, context.getHandler());
    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      tap((result) => {
        const paramId = request.params?.id;
        const targetId =
          (Array.isArray(paramId) ? paramId[0] : paramId) ??
          (result as { id?: string } | undefined)?.id ??
          null;

        void this.auditService.record({
          actorUserId: request.user?.id ?? null,
          action: meta.action,
          targetType: meta.targetType,
          targetId,
          before: request.auditBefore,
          after: result,
          ip: request.ip ?? null,
        });
      }),
    );
  }
}
