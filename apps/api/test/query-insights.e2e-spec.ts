import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { STATS_COUNTER_HISTORY_FILTER } from '@app/shared';
import type { PrismaService } from '../src/prisma/prisma.service';
import { auth, bootApp, cleanupUsers, createRoleUser, type E2eUser } from './fixtures/query-log-e2e-fixtures';
import { insertRows, insightsAt, parseCsv, waitAudit, type InsightsRow } from './fixtures/query-insights-e2e-fixtures';

type Made = E2eUser & { roleId: string };

/** Top / latency / user+IP activity / CSV / authz / audit. Fixed 2019 window, rows isolated by username prefix. */
describe('Query insights (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const sfx = Date.now();
  const P = `qi${sfx}`;
  const DS1 = `E2E_QI_DS1_${sfx}`;
  const DS2 = `E2E_QI_DS2_${sfx}`;
  const day = '2019-03-04'; // Monday
  const subjects: Record<string, string> = {};
  let full: Made; let viewAll: Made; let ownOnly: Made; let exportOnly: Made;
  const base = `username=${P}&from=${day}&to=${day}`;
  const get = (path: string, token?: string) => {
    const r = request(app.getHttpServer()).get(`/api/v1/admin/query-insights/${path}`);
    return token ? r.set(auth(token)) : r;
  };
  const csv = (q: string, t: string) =>
    get(`export.csv?${q}`, t).buffer(true).parse((res, cb) => {
      let d = ''; res.setEncoding('utf8'); res.on('data', (c) => (d += c)); res.on('end', () => cb(null, d));
    });

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    full = await createRoleUser(app, prisma, `QI_FULL_${sfx}`, ['history:view_all', 'history:view_sensitive', 'history:export']);
    viewAll = await createRoleUser(app, prisma, `QI_VIEW_${sfx}`, ['history:view_all']);
    ownOnly = await createRoleUser(app, prisma, `QI_OWN_${sfx}`, ['history:view_own']);
    exportOnly = await createRoleUser(app, prisma, `QI_EXP_${sfx}`, ['history:export']);
    for (const k of ['a', 'b', 'c', 'evil']) {
      const username = k === 'evil' ? `=${P}_evil` : `${P}_${k}`;
      subjects[k] = (await prisma.user.create({ data: { username, fullName: `QI ${k}`, passwordHash: 'x' } })).id;
    }
    const u = (k: string) => ({ userId: subjects[k]!, username: k === 'evil' ? `=${P}_evil` : `${P}_${k}` });
    const t = (m: number) => insightsAt(day, `10:${String(m).padStart(2, '0')}:00`);
    const rows: InsightsRow[] = [
      // A: DS1 durations 100,200,300,400,1000 success + 1 failed(50) + 1 denied (no duration)
      ...[100, 200, 300, 400, 1000].map((d, i) => ({ ...u('a'), code: DS1, at: t(i), recordCount: 1, statusCode: 200, durationMs: d, ip: '10.9.0.1', userAgent: 'UA-1' })),
      { ...u('a'), code: DS1, at: t(10), status: 'failed', statusCode: 504, errorCode: 'UPSTREAM_TIMEOUT', durationMs: 50, ip: '10.9.0.3', userAgent: 'UA-3' },
      { ...u('a'), code: DS1, at: t(11), status: 'denied', statusCode: 403, errorCode: 'FORBIDDEN_DS', ip: '10.9.0.3', userAgent: 'UA-3' },
      { ...u('a'), code: DS1, at: insightsAt('2019-03-01', '10:00:00'), recordCount: 1, statusCode: 200, ip: '10.9.0.1' }, // all-time firstAt
      // B: 3 empty successes DS2 (gap) on the shared IP
      ...[10, 20, 30].map((d, i) => ({ ...u('b'), code: DS2, at: t(20 + i), recordCount: 0, statusCode: 200, durationMs: d, ip: '10.9.0.1', userAgent: 'UA-2' })),
      // C: 2 failed DS2
      ...[40, 60].map((d, i) => ({ ...u('c'), code: DS2, at: t(30 + i), status: 'failed' as const, statusCode: 422, errorCode: 'VALIDATION_ERROR', durationMs: d, ip: '10.9.0.2' })),
      // anonymous (user_id NULL) on the shared IP, no duration
      { userId: null, username: `${P}_anon`, code: DS2, at: t(40), recordCount: 1, statusCode: 200, ip: '10.9.0.1' },
      // IPv6
      { ...u('c'), code: DS2, at: t(41), recordCount: 1, statusCode: 200, ip: '2001:db8::7' },
      // CSV-injection username, other day
      { ...u('evil'), code: DS2, at: insightsAt('2019-03-05', '10:00:00'), recordCount: 1, statusCode: 200, ip: '10.9.0.9' },
    ];
    await insertRows(prisma, rows);
  });

  afterAll(async () => {
    await prisma.queryLog.deleteMany({ where: { usernameSnapshot: { contains: P } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(subjects) } } });
    await cleanupUsers(prisma, [full, viewAll, ownOnly, exportOnly]);
    await app.close();
  });

  describe('authz + validation', () => {
    const paths = ['top-users', 'top-errors', 'datasource-latency', 'anomalies', `users/${randomUUID()}/activity`, 'ips/10.9.0.1/activity'];
    it('401 without token', async () => {
      for (const p of [...paths, 'export.csv']) expect((await get(`${p}?${base}`)).status).toBe(401);
    });
    it('403 for view_own only (every route incl. csv) and export-only (no view_all)', async () => {
      for (const p of paths) expect((await get(`${p}?${base}`, ownOnly.token)).status).toBe(403);
      expect((await get(`export.csv?${base}&table=top-users`, ownOnly.token)).status).toBe(403);
      for (const p of paths) expect((await get(`${p}?${base}`, exportOnly.token)).status).toBe(403);
      expect((await get(`export.csv?${base}&table=top-users`, exportOnly.token)).status).toBe(403);
    });
    it('view_all without history:export -> 403 CSV, 200 JSON', async () => {
      expect((await get(`top-users?${base}`, viewAll.token)).status).toBe(200);
      expect((await get(`export.csv?${base}&table=top-users`, viewAll.token)).status).toBe(403);
    });
    it('422: missing range, > 90 days, bad limit/metric/table/uuid/ip', async () => {
      const t = full.token;
      expect((await get(`top-users?username=${P}`, t)).status).toBe(422);
      expect((await get(`top-users?from=${day}`, t)).status).toBe(422);
      expect((await get(`top-users?from=2019-03-01&to=2019-05-30`, t)).status).toBe(422); // 91 days
      expect((await get(`top-users?from=2019-03-01&to=2019-05-29`, t)).status).toBe(200); // exactly 90 days
      expect((await get(`top-users?${base}&limit=101`, t)).status).toBe(422);
      expect((await get(`top-users?${base}&limit=0`, t)).status).toBe(422);
      expect((await get(`top-users?${base}&metric=drop`, t)).status).toBe(422);
      expect((await get(`export.csv?${base}&table=nope`, t)).status).toBe(422);
      expect((await get(`export.csv?${base}`, t)).status).toBe(422);
      expect((await get(`users/not-a-uuid/activity?${base}`, t)).status).toBe(422);
      expect((await get(`ips/not-an-ip/activity?${base}`, t)).status).toBe(422);
    });
    it('SQL-injection-looking filter is a bound parameter', async () => {
      const res = await get(`top-users?username=${encodeURIComponent(`x'; DROP TABLE app.query_logs;--`)}&from=${day}&to=${day}`, full.token);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('top lists + latency', () => {
    it('top-users by requests; every counter equals /history with the same filter', async () => {
      const res = await get(`top-users?${base}`, full.token);
      expect(res.status).toBe(200);
      const byName = Object.fromEntries((res.body as { username: string }[]).map((r) => [r.username, r]));
      expect((res.body as unknown[]).map((r) => (r as { requests: number }).requests)).toEqual([7, 3, 3, 1]); // a, b, c(2 failed + 1 IPv6), anon
      expect(byName[`${P}_a`]).toMatchObject({ requests: 7, answered: 5, gap: 2, failed: 1, denied: 1, p95DurationMs: 850 });
      expect(byName[`${P}_b`]).toMatchObject({ requests: 3, gap: 3, failed: 0, denied: 0, avgDurationMs: 20, p95DurationMs: 29 });
      for (const [k, id] of Object.entries(subjects)) {
        const row = byName[k === 'evil' ? `=${P}_evil` : `${P}_${k}`];
        if (!row) continue;
        for (const key of ['requests', 'failed', 'denied', 'gap'] as const) {
          const p = new URLSearchParams({ ...STATS_COUNTER_HISTORY_FILTER[key], userId: id, from: day, to: day, pageSize: '1' } as Record<string, string>);
          const h = await request(app.getHttpServer()).get(`/api/v1/history?${p}`).set(auth(full.token));
          expect(row[key]).toBe(h.body.total);
        }
      }
    });
    it('metrics failed / denied / gap order + zero rows excluded; limit', async () => {
      const names = async (m: string) => ((await get(`top-users?${base}&metric=${m}`, full.token)).body as { username: string; failed: number }[]).map((r) => r.username);
      expect(await names('failed')).toEqual([`${P}_c`, `${P}_a`]);
      expect(await names('denied')).toEqual([`${P}_a`]);
      expect(await names('gap')).toEqual([`${P}_b`, `${P}_a`, `${P}_c`]);
      expect(((await get(`top-users?${base}&limit=1`, full.token)).body as unknown[]).length).toBe(1);
    });
    it('half-open VN range: 00:00 VN of next day excluded, 23:59 included', async () => {
      await insertRows(prisma, [
        { userId: subjects.a!, username: `${P}_a`, code: DS1, at: insightsAt('2019-03-06', '23:59:00'), recordCount: 1 },
        { userId: subjects.a!, username: `${P}_a`, code: DS1, at: insightsAt('2019-03-07', '00:00:00'), recordCount: 1 },
      ]);
      const n = async (d: string) => ((await get(`top-users?username=${P}&from=${d}&to=${d}`, full.token)).body as { requests: number }[]).reduce((s, r) => s + r.requests, 0);
      expect(await n('2019-03-06')).toBe(1);
      expect(await n('2019-03-07')).toBe(1);
      const exact = await get(`top-users?username=${P}&from=2019-03-06T23:59:00%2B07:00&to=2019-03-07T00:00:00%2B07:00`, full.token);
      expect((exact.body as { requests: number }[]).reduce((s, r) => s + r.requests, 0)).toBe(1);
    });
    it('top-errors: count desc then errorCode asc; success rows excluded', async () => {
      const res = await get(`top-errors?${base}`, full.token);
      expect(res.body).toEqual([
        { errorCode: 'VALIDATION_ERROR', statusCode: 422, count: 2 },
        { errorCode: 'FORBIDDEN_DS', statusCode: 403, count: 1 },
        { errorCode: 'UPSTREAM_TIMEOUT', statusCode: 504, count: 1 },
      ]);
      expect(((await get(`top-errors?${base}&limit=1`, full.token)).body as unknown[]).length).toBe(1);
    });
    it('datasource-latency: avg/p95 (interpolated) / max, sorted p95 desc', async () => {
      const res = await get(`datasource-latency?${base}`, full.token);
      expect(res.body).toEqual([
        { datasourceCode: DS1, name: null, requests: 7, avgDurationMs: 342, p95DurationMs: 850, maxDurationMs: 1000 },
        { datasourceCode: DS2, name: null, requests: 7, avgDurationMs: 32, p95DurationMs: 56, maxDurationMs: 60 },
      ]);
    });
  });

  describe('user + IP activity', () => {
    it('user activity: all-time first/last, totals in range, ip/UA/datasource breakdown', async () => {
      const res = await get(`users/${subjects.a}/activity?${base}`, full.token);
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ id: subjects.a, username: `${P}_a` });
      expect(res.body.firstAt).toBe('2019-03-01T03:00:00.000Z');
      expect(res.body.lastAt).toBe('2019-03-06T17:00:00.000Z'); // all-time: later rows outside the filter range count
      expect(res.body.totals).toMatchObject({ requests: 7, failed: 1, denied: 1, gap: 2 });
      expect(res.body.byDatasource).toEqual([{ datasourceCode: DS1, name: null, count: 7 }]);
      expect(res.body.ips.map((i: { ip: string; count: number }) => [i.ip, i.count])).toEqual([['10.9.0.1', 5], ['10.9.0.3', 2]]);
      expect(res.body.userAgents.map((i: { userAgent: string; count: number }) => [i.userAgent, i.count])).toEqual([['UA-1', 5], ['UA-3', 2]]);
    });
    it('user activity: unknown user -> 404; filter userId in query cannot override path', async () => {
      expect((await get(`users/${randomUUID()}/activity?${base}`, full.token)).status).toBe(404);
      const res = await get(`users/${subjects.a}/activity?${base}&userId=${subjects.b}`, full.token);
      expect(res.body.totals.requests).toBe(7);
    });
    it('ip activity: users on shared IP (incl. anonymous), multiAccount, single-user IP, IPv6', async () => {
      const res = await get(`ips/10.9.0.1/activity?${base}`, full.token);
      expect(res.status).toBe(200);
      expect(res.body.multiAccount).toBe(true);
      expect(res.body.totals.requests).toBe(9);
      expect(res.body.users.map((u: { username: string; count: number }) => [u.username, u.count])).toEqual([[`${P}_a`, 5], [`${P}_b`, 3], [`${P}_anon`, 1]]);
      expect(res.body.users[2].userId).toBeNull();
      expect(res.body.userAgents.map((x: { userAgent: string }) => x.userAgent)).toEqual(['UA-1', 'UA-2']);
      const solo = await get(`ips/10.9.0.2/activity?${base}`, full.token);
      expect(solo.body).toMatchObject({ multiAccount: false, totals: { requests: 2 } });
      const v6 = await get(`ips/${encodeURIComponent('2001:db8::7')}/activity?${base}`, full.token);
      expect(v6.status).toBe(200);
      expect(v6.body.totals.requests).toBe(1);
    });
    it('audit: view_user_activity / view_ip_activity store filters + target, never the response', async () => {
      await get(`users/${subjects.a}/activity?${base}`, full.token);
      await get(`ips/10.9.0.1/activity?${base}`, full.token);
      const u = await waitAudit(prisma, 'query_log.view_user_activity', full.id, subjects.a);
      expect(u).toMatchObject({ targetType: 'user', targetId: subjects.a });
      expect((u!.after as { filters: object }).filters).toMatchObject({ username: P, from: day, to: day });
      expect(JSON.stringify(u!.after)).not.toContain('UA-1');
      const i = await waitAudit(prisma, 'query_log.view_ip_activity', full.id, '10.9.0.1');
      expect(i).toMatchObject({ targetType: 'ip', targetId: '10.9.0.1' });
      expect(JSON.stringify(i!.after)).not.toContain(`${P}_b`);
      expect(i!.before).toBeNull();
    });
  });

  describe('csv', () => {
    it('top-users CSV: BOM, header, same rows as JSON, formula injection neutralised, audited', async () => {
      const q = `username=${P}&from=2019-03-04&to=2019-03-05&table=top-users`;
      const res = await csv(q, full.token);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="phan-tich-tra-cuu-top-users-\d{8}-\d{4}\.csv"/);
      const text = res.body as string;
      expect(text.startsWith('﻿"User ID"')).toBe(true);
      expect(text).toContain(`"'=${P}_evil"`);
      const rows = parseCsv(text.slice(1));
      const json = await get(`top-users?username=${P}&from=2019-03-04&to=2019-03-05`, full.token);
      expect(rows.length - 1).toBe(json.body.length);
      for (const r of rows) for (const c of r) expect(c).not.toMatch(/^[=+\-@\t\r]/);
      const a = await waitAudit(prisma, 'query_insights.export_csv', full.id);
      expect(a!.after).toMatchObject({ filters: { username: P }, table: 'top-users', rows: json.body.length });
      expect(JSON.stringify(a!.after)).not.toContain('Tên đăng nhập');
    });
    it('other tables return 200 with correct header; top-errors + latency row counts', async () => {
      const errs = parseCsv(((await csv(`${base}&table=top-errors`, full.token)).body as string).slice(1));
      expect(errs).toHaveLength(4);
      const lat = parseCsv(((await csv(`${base}&table=datasource-latency`, full.token)).body as string).slice(1));
      expect(lat[1]).toEqual([DS1, '', '7', '342', '850', '1000']);
    });
  });
});
