import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  auth, bootApp, cleanupUsers, createRoleUser, toQueryLogData, type E2eUser, type RowInput,
} from './fixtures/query-log-e2e-fixtures';

type Made = E2eUser & { roleId: string };

/** Real Postgres. Filters, sort, paging, scope (view_own vs view_all), 403/404/422 for GET /history*. */
describe('History filters, sort, scope (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const sfx = Date.now();
  const C = `E2E_HF_${sfx}`; // main dataset
  const C2 = `E2E_HB_${sfx}`; // VN-day boundary rows
  let aud: Made;
  let own: Made;
  let none: Made;
  const ids: Record<string, string> = {};
  const DAY = 'from=2021-05-09&to=2021-05-10'; // VN days 9..10 inclusive => [05-08T17:00Z, 05-10T17:00Z)

  const hist = (q: string, t = aud.token) => request(app.getHttpServer()).get(`/api/v1/history?datasourceCode=${C}&${DAY}&${q}`).set(auth(t));
  const total = async (q: string) => (await hist(`${q}&pageSize=1`)).body.total as number;

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    aud = await createRoleUser(app, prisma, `HF_AUD_${sfx}`, ['history:view_all']);
    own = await createRoleUser(app, prisma, `HF_OWN_${sfx}`, ['history:view_own']);
    none = await createRoleUser(app, prisma, `HF_NONE_${sfx}`, []);

    const base = { code: C };
    const rows: Record<string, RowInput> = {
      r1: { ...base, at: '2021-05-10T03:00:00Z', userId: own.id, username: 'alice_x', recordCount: 3, statusCode: 200, durationMs: 100, ip: '10.0.0.1', upstreamRequestId: 'UP-1' },
      r2: { ...base, at: '2021-05-10T03:10:00Z', userId: aud.id, recordCount: 0, statusCode: 200, durationMs: 200, ip: '10.0.0.2' },
      r3: { ...base, at: '2021-05-10T03:20:00Z', userId: aud.id, recordCount: null, statusCode: 200 },
      r4: { ...base, at: '2021-05-10T03:30:00Z', userId: own.id, status: 'failed', statusCode: 504, errorCode: 'UPSTREAM_TIMEOUT', durationMs: 300, ip: '10.0.0.1' },
      r5: { ...base, at: '2021-05-10T03:40:00Z', userId: own.id, status: 'failed', statusCode: 422, errorCode: 'VALIDATION_ERROR', recordCount: 4, durationMs: 50 },
      r6: { ...base, at: '2021-05-10T03:50:00Z', userId: own.id, status: 'denied', statusCode: 403 },
      r7: { ...base, at: '2021-05-10T04:00:00Z', userId: null, username: 'legacy%user', status: 'failed' },
      r8: { ...base, at: '2021-05-09T15:00:00Z', userId: aud.id, recordCount: 1, statusCode: 200, durationMs: 10 }, // Sunday 22:00 VN
      b1: { code: C2, at: '2021-05-10T16:59:59.999Z', userId: aud.id, recordCount: 1, statusCode: 200 },
      b2: { code: C2, at: '2021-05-10T17:00:00.000Z', userId: aud.id, recordCount: 1, statusCode: 200 },
    };
    for (const [k, r] of Object.entries(rows)) {
      const row = await prisma.queryLog.create({ data: { ...toQueryLogData(r), userAgent: `UA-${k}` } });
      ids[k] = row.id;
    }
  });

  afterAll(async () => {
    await prisma.queryLog.deleteMany({ where: { datasourceCode: { in: [C, C2] } } });
    await cleanupUsers(prisma, [aud, own, none]);
    await app.close();
  });

  it('no filter = all 8 rows of the dataset', async () => expect(await total('')).toBe(8));

  it.each([
    ['status=failed', 3], ['status=failed,denied', 4], ['status=success', 4], ['status=success,failed,denied', 8],
    ['statusCode=504', 1], ['statusCode=__null__', 1], ['errorCode=UPSTREAM_TIMEOUT', 1], ['errorCode=__null__', 6],
    ['ip=10.0.0.1', 2], ['durationMinMs=100', 3], ['durationMaxMs=100', 3], ['durationMinMs=100&durationMaxMs=200', 2],
    ['outcome=answered', 2], ['outcome=empty', 2], ['outcome=gap', 6], ['hasRecords=true', 3], ['hasRecords=false', 5],
    ['upstreamRequestId=UP-1', 1], ['offHours=true', 1], ['username=ALICE', 1], ['username=%25', 1],
    ['userId=__null__', 1],
  ])('filter %s -> total %i', async (q, n) => {
    expect(await total(q)).toBe(n);
  });

  it('userId filter honoured for view_all', async () => expect(await total(`userId=${own.id}`)).toBe(4));

  it('filters AND-combine: failed + errorCode + statusCode', async () => {
    const res = await hist('status=failed&errorCode=VALIDATION_ERROR&statusCode=422');
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe(ids.r5);
  });

  it('summary agrees with list total and counts (same filter)', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/history/summary?datasourceCode=${C}&${DAY}`).set(auth(aud.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 8, success: 4, failed: 3, denied: 1, answered: 2, gap: 6, empty: 2 });
    expect(res.body.successRate).toBe(0.5);
    expect(res.body.avgDurationMs).toBe(Math.round((100 + 200 + 300 + 50 + 10) / 5));
    expect(res.body.p95DurationMs).toBe(Math.round(280)); // percentile_cont .95 over [10,50,100,200,300]
    const empty = await request(app.getHttpServer()).get(`/api/v1/history/summary?datasourceCode=NOPE_${sfx}`).set(auth(aud.token));
    expect(empty.body).toMatchObject({ total: 0, successRate: null, avgDurationMs: null, p95DurationMs: null });
  });

  it('sort durationMs asc/desc with NULLS LAST and id DESC tie-break', async () => {
    const asc = (await hist('sort=durationMs&order=asc&pageSize=20')).body.items as { id: string; durationMs: number | null }[];
    expect(asc.map((i) => i.durationMs).slice(0, 5)).toEqual([10, 50, 100, 200, 300]);
    expect(asc.slice(5).every((i) => i.durationMs === null)).toBe(true);
    const nullIds = asc.slice(5).map((i) => i.id);
    expect(nullIds).toEqual([...nullIds].sort().reverse());
    const desc = (await hist('sort=durationMs&order=desc&pageSize=20')).body.items as { durationMs: number | null }[];
    expect(desc.map((i) => i.durationMs).slice(0, 5)).toEqual([300, 200, 100, 50, 10]);
    const rc = (await hist('sort=recordCount&order=desc&pageSize=20')).body.items as { recordCount: number | null }[];
    expect(rc.map((i) => i.recordCount).slice(0, 3)).toEqual([4, 3, 1]);
    expect(rc.slice(-4).every((i) => i.recordCount === null)).toBe(true);
  });

  it('default sort createdAt desc; paging is stable and complete', async () => {
    const p1 = (await hist('pageSize=5&page=1')).body;
    const p2 = (await hist('pageSize=5&page=2')).body;
    const seen = [...p1.items, ...p2.items].map((i: { id: string }) => i.id);
    expect(new Set(seen).size).toBe(8);
    expect(p1.items[0].id).toBe(ids.r7);
  });

  it('offset ceiling: page*pageSize > 10000 -> 422; = 10000 ok; bad sort -> 422', async () => {
    expect((await hist('page=101&pageSize=100')).status).toBe(422);
    expect((await hist('page=100&pageSize=100')).status).toBe(200);
    expect((await hist('sort=password')).status).toBe(422);
    expect((await hist('status=bogus')).status).toBe(422);
    expect((await hist('ip=not-an-ip')).status).toBe(422);
  });

  it('half-open range in VN time: 23:59:59.999 in day, 00:00 next day out; row exactly at `to` excluded', async () => {
    const q = (s: string) => request(app.getHttpServer()).get(`/api/v1/history?datasourceCode=${C2}&${s}`).set(auth(aud.token));
    const idsOf = async (s: string) => ((await q(s)).body.items as { id: string }[]).map((i) => i.id);
    expect(await idsOf('from=2021-05-10&to=2021-05-10')).toEqual([ids.b1]);
    expect(await idsOf('from=2021-05-11&to=2021-05-11')).toEqual([ids.b2]);
    expect(await idsOf('from=2021-05-10T00:00:00.000%2B07:00&to=2021-05-10T17:00:00.000Z')).toEqual([ids.b1]);
    expect(await idsOf('from=2021-05-10T17:00:00.000Z&to=2021-05-11T17:00:00.000Z')).toEqual([ids.b2]);
    expect(await idsOf('from=2021-05-10T23:59:59.999%2B07:00&to=2021-05-11T00:00:00.000%2B07:00')).toEqual([ids.b1]);
    expect((await q('from=2021-05-11&to=2021-05-10')).status).toBe(422);
  });

  describe('scope', () => {
    it('view_own: sees only own rows even with userId/username/ip of others', async () => {
      const res = await hist(`userId=${aud.id}&username=nobody&ip=10.0.0.2&pageSize=100`, own.token);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(4);
      expect(res.body.items.every((i: { userId: string }) => i.userId === own.id)).toBe(true);
      // other filters still apply inside the forced scope
      expect((await hist('status=failed', own.token)).body.total).toBe(2);
    });

    it('view_own: summary/datasources -> 403, export -> 403, none -> 403', async () => {
      const get = (p: string, t: string) => request(app.getHttpServer()).get(`/api/v1/history${p}`).set(auth(t));
      expect((await get('/summary', own.token)).status).toBe(403);
      expect((await get('/datasources', own.token)).status).toBe(403);
      expect((await get('/export.csv', own.token)).status).toBe(403);
      expect((await get('/export.csv', aud.token)).status).toBe(403); // view_all alone != history:export
      expect((await get('', none.token)).status).toBe(403);
      expect((await get('/summary', none.token)).status).toBe(403);
      expect((await request(app.getHttpServer()).get('/api/v1/history/summary')).status).toBe(401);
    });

    it('detail: ip + userAgent, own 200, other 404, unknown 404, bad uuid 422', async () => {
      const get = (id: string, t: string) => request(app.getHttpServer()).get(`/api/v1/history/${id}`).set(auth(t));
      const ok = await get(ids.r1!, own.token);
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ id: ids.r1, ip: '10.0.0.1', userAgent: 'UA-r1', upstreamRequestId: 'UP-1' });
      expect((await get(ids.r2!, own.token)).status).toBe(404);
      expect((await get(ids.r2!, aud.token)).status).toBe(200);
      expect((await get('00000000-0000-4000-8000-000000000000', aud.token)).status).toBe(404);
      expect((await get('not-a-uuid', aud.token)).status).toBe(422);
    });

    it('audit query_log.view_detail written with targetId and without queryParams/response', async () => {
      await request(app.getHttpServer()).get(`/api/v1/history/${ids.r1}`).set(auth(own.token));
      let row = null;
      for (let i = 0; i < 20 && !row; i++) {
        row = await prisma.auditLog.findFirst({ where: { action: 'query_log.view_detail', targetId: ids.r1, actorUserId: own.id } });
        if (!row) await new Promise((r) => setTimeout(r, 100));
      }
      expect(row).not.toBeNull();
      const after = row!.after as Record<string, unknown>;
      expect(JSON.stringify(after)).not.toMatch(/queryParams|querySummary|userAgent/);
      // a 404 must not be audited
      await request(app.getHttpServer()).get(`/api/v1/history/${ids.r2}`).set(auth(own.token));
      await new Promise((r) => setTimeout(r, 300));
      expect(await prisma.auditLog.count({ where: { action: 'query_log.view_detail', targetId: ids.r2, actorUserId: own.id } })).toBe(0);
    });
  });
});
