import type { NextFunction, Request, Response } from 'express';
import { RequestIdMiddleware } from './request-id.middleware';

function run(inbound?: string) {
  const req = { header: () => inbound } as unknown as Request;
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => (headers[k] = v) } as unknown as Response;
  new RequestIdMiddleware().use(req, res, (() => undefined) as NextFunction);
  return { id: req.requestId, headers };
}

describe('RequestIdMiddleware', () => {
  it('keeps a plain inbound id (FE/gateway correlation) and echoes it', () => {
    const { id, headers } = run('web-0a1b2c3d4e5f');
    expect(id).toBe('web-0a1b2c3d4e5f');
    expect(headers['X-Request-Id']).toBe('web-0a1b2c3d4e5f');
  });

  it('replaces an inbound id that could inject log lines or is too long', () => {
    for (const bad of ['a b', 'line\nbreak', 'x'.repeat(65), '<script>']) {
      expect(run(bad).id).not.toBe(bad);
    }
  });

  it('generates an id when none is sent', () => {
    expect(run(undefined).id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
