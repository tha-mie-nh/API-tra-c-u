import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'auditAction';

export interface AuditActionMeta {
  action: string;
  targetType: string;
}

/** Marks a controller mutation method for automatic before/after audit
 * logging by AuditInterceptor (global). `before` is read from
 * `request.auditBefore` (set by the controller right before mutating, when
 * applicable); `after` is the handler's own return value. */
export const AuditAction = (action: string, targetType: string) =>
  SetMetadata(AUDIT_ACTION_KEY, { action, targetType } satisfies AuditActionMeta);
