import { of, lastValueFrom } from 'rxjs';
import type { ExecutionContext, CallHandler } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { AuditInterceptor } from './audit.interceptor';
import type { AuditActionMeta } from './audit-action.decorator';
import type { AuditService } from './audit.service';

function run(meta: AuditActionMeta, request: Record<string, unknown>, result: unknown) {
  const record = jest.fn().mockResolvedValue(undefined);
  const interceptor = new AuditInterceptor(
    { get: () => meta } as unknown as Reflector,
    { record } as unknown as AuditService,
  );
  const ctx = {
    getHandler: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const next = { handle: () => of(result) } as CallHandler;
  return lastValueFrom(interceptor.intercept(ctx, next) as never).then(() => record.mock.calls[0][0]);
}

describe('AuditInterceptor', () => {
  const baseReq = { user: { id: 'u1' }, ip: '1.2.3.4', params: { userId: 'target-1' }, query: { from: '2026-11-01' } };

  it("capture:'request' records filters/params + auditExtra and never the response", async () => {
    const secret = { citizenId: '079012345678' };
    const call = await run(
      { action: 'query_log.view_user_activity', targetType: 'user', capture: 'request', targetParam: 'userId' },
      { ...baseReq, auditBefore: { x: 1 }, auditExtra: { rows: 5 } },
      { id: 'resp-id', items: [secret] },
    );
    expect(call.targetId).toBe('target-1');
    expect(call.before).toBeUndefined();
    expect(call.after).toEqual({ filters: { from: '2026-11-01' }, params: { userId: 'target-1' }, rows: 5 });
    expect(JSON.stringify(call)).not.toContain('079012345678');
    expect(JSON.stringify(call)).not.toContain('resp-id');
  });

  it("default capture:'result' keeps legacy behaviour", async () => {
    const call = await run(
      { action: 'role.create', targetType: 'role', capture: 'result' },
      { user: { id: 'u1' }, ip: null, params: {}, query: {}, auditBefore: { a: 1 } },
      { id: 'new-id', name: 'X' },
    );
    expect(call.targetId).toBe('new-id');
    expect(call.before).toEqual({ a: 1 });
    expect(call.after).toEqual({ id: 'new-id', name: 'X' });
  });
});
