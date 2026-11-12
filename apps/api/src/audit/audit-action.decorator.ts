import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'auditAction';

export interface AuditActionMeta {
  action: string;
  targetType: string;
  /** 'result' (default): audit `after` = handler result. 'request': audit
   * only filters/params (+ request.auditExtra), NEVER the response — for
   * read endpoints whose response may contain real CCCD/PII. */
  capture: 'result' | 'request';
  /** Route param name used as targetId (e.g. 'userId'); falls back to id/code. */
  targetParam?: string;
}

export interface AuditActionOptions {
  capture?: 'result' | 'request';
  targetParam?: string;
}

/** Marks a controller mutation method for automatic before/after audit
 * logging by AuditInterceptor (global). `before` is read from
 * `request.auditBefore` (set by the controller right before mutating, when
 * applicable); `after` is the handler's own return value. */
export const AuditAction = (action: string, targetType: string, opts: AuditActionOptions = {}) =>
  SetMetadata(AUDIT_ACTION_KEY, {
    action,
    targetType,
    capture: opts.capture ?? 'result',
    targetParam: opts.targetParam,
  } satisfies AuditActionMeta);
