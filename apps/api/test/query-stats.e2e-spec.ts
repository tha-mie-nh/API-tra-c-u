import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { QueryStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Real Postgres. Fixed historical custom range (2020-03-14 VN day) so results
 * are deterministic regardless of when the test runs. Rows are tagged with
 * unique datasource codes so other data in the DB cannot interfere.
 */
describe('Query stats (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = Date.now();
  const codeA = `E2E_STATS_A_${suffix}`;
  const codeB = `E2E_STATS_B_${suffix}`;
  const codeT = `E2E_STATS_TZ_${suffix}`;
  const statsRoleCode = `E2E_STATS_ROLE_${suffix}`;
  const noPermRoleCode = `E2E_STATS_NOPERM_${suffix}`;
  const statsUser = `e2e_stats_admin_${suffix}`;
  const noPermUser = `e2e_stats_noperm_${suffix}`;
  const password = 'StatsE2E#Passw0rd123';
  const range = 'preset=custom&from=2020-03-14&to=2020-03-14';
  let token: string;
  let noPermToken: string;

  // VN day 2020-03-14 == [2020-03-13T17:00Z, 2020-03-14T17:00Z)
  const row = (
    datasourceCode: string,
    createdAt: string,
    status: 'success' | 'failed' | 'denied',
    extra: { recordCount?: number; statusCode?: number; errorCode?: string; durationMs?: number } = {},
  ) => ({
    usernameSnapshot: statsUser,
    datasourceCode,
    queryParams: {},
    status: QueryStatus[status.toUpperCase() as keyof typeof QueryStatus],
    createdAt: new Date(createdAt),
    ...extra,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const perm = await prisma.permission.findUniqueOrThrow({ where: { code: 'admin:query_stats' } });
    const role = await prisma.role.create({ data: { code: statsRoleCode, name: 'E2E stats' } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    const noRole = await prisma.role.create({ data: { code: noPermRoleCode, name: 'E2E stats none' } });

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const u1 = await prisma.user.create({ data: { username: statsUser, fullName: 'E2E Stats', passwordHash } });
    await prisma.userRole.create({ data: { userId: u1.id, roleId: role.id } });
    const u2 = await prisma.user.create({ data: { username: noPermUser, fullName: 'E2E NoPerm', passwordHash } });
    await prisma.userRole.create({ data: { userId: u2.id, roleId: noRole.id } });

    const login = async (username: string) =>
      (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password })).body
        .accessToken as string;
    token = await login(statsUser);
    noPermToken = await login(noPermUser);

    await prisma.queryLog.createMany({
      data: [
        // codeA: inside the VN day
        row(codeA, '2020-03-13T17:00:00Z', 'success', { recordCount: 3, statusCode: 200, durationMs: 100 }), // 00:00 VN (included)
        row(codeA, '2020-03-14T05:00:00Z', 'success', { recordCount: 0, statusCode: 200, durationMs: 200 }), // empty, 12:00 VN
        row(codeA, '2020-03-14T05:30:00Z', 'failed', { statusCode: 504, errorCode: 'UPSTREAM_TIMEOUT', durationMs: 300 }),
        row(codeA, '2020-03-14T06:00:00Z', 'failed', { statusCode: 422, errorCode: 'VALIDATION_ERROR' }),
        row(codeA, '2020-03-14T06:10:00Z', 'denied', { statusCode: 403 }),
        row(codeA, '2020-03-14T16:59:00Z', 'success', { recordCount: 5, statusCode: 200 }), // 23:59 VN (included)
        // outside: 23:59 VN the previous day, and 00:00 VN next day
        row(codeA, '2020-03-13T16:59:00Z', 'success', { recordCount: 9, statusCode: 200 }),
        row(codeA, '2020-03-14T17:00:00Z', 'success', { recordCount: 9, statusCode: 200 }),
        // codeB
        row(codeB, '2020-03-14T01:00:00Z', 'success', { recordCount: 2, statusCode: 200 }),
        row(codeB, '2020-03-14T01:05:00Z', 'failed', { statusCode: 504, errorCode: 'UPSTREAM_TIMEOUT' }),
        // codeT: VN timezone bucket edges (day and month rollover)
        row(codeT, '2019-12-31T16:59:59.999Z', 'success', { recordCount: 1, statusCode: 200 }), // 23:59:59.999 VN 31/12
        row(codeT, '2019-12-31T17:00:00.000Z', 'success', { recordCount: 1, statusCode: 200 }), // 00:00 VN 01/01
        row(codeT, '2020-01-31T16:59:59.999Z', 'success', { recordCount: 1, statusCode: 200 }), // 23:59:59.999 VN 31/01
        row(codeT, '2020-01-31T17:00:00.000Z', 'success', { recordCount: 1, statusCode: 200 }), // 00:00 VN 01/02
      ],
    });
  });

  afterAll(async () => {
    await prisma.queryLog.deleteMany({ where: { datasourceCode: { in: [codeA, codeB, codeT] } } });
    await prisma.user.deleteMany({ where: { username: { in: [statsUser, noPermUser] } } });
    await prisma.role.deleteMany({ where: { code: { in: [statsRoleCode, noPermRoleCode] } } });
    await app.close();
  });

  const get = (path: string, t?: string) => {
    const r = request(app.getHttpServer()).get(`/api/v1/admin/query-stats/${path}`);
    return t ? r.set('Authorization', `Bearer ${t}`) : r;
  };

  it('overview: per-datasource counters, VN day boundaries, gap formula', async () => {
    const res = await get(`overview?${range}`, token);
    expect(res.status).toBe(200);
    expect(res.body.range.granularity).toBe('hour');
    expect(res.body.range.from).toBe('2020-03-13T17:00:00.000Z');

    const a = res.body.byDatasource.find((r: { datasourceCode: string }) => r.datasourceCode === codeA);
    const b = res.body.byDatasource.find((r: { datasourceCode: string }) => r.datasourceCode === codeB);
    expect(a).toMatchObject({
      name: null, requests: 6, answered: 2, gap: 4, success: 3, empty: 1, failed: 2, denied: 1, errors: 3, records: 8,
    });
    expect(b).toMatchObject({ requests: 2, answered: 1, gap: 1, failed: 1, denied: 0, records: 2 });
    expect(res.body.totals.requests).toBeGreaterThanOrEqual(8);
    expect(typeof res.body.totals.requests).toBe('number');
  });

  it('overview: hourly timeseries is zero-filled (24 buckets) with VN hours', async () => {
    const res = await get(`overview?${range}`, token);
    const ts = res.body.timeseries as { bucket: string; requests: number }[];
    expect(ts).toHaveLength(24);
    expect(ts[0]!.bucket).toBe('2020-03-14T00');
    expect(ts[23]!.bucket).toBe('2020-03-14T23');
    expect(ts[0]!.requests).toBeGreaterThanOrEqual(1); // 00:00 VN row
    expect(ts[23]!.requests).toBeGreaterThanOrEqual(1); // 23:59 VN row
  });

  it('detail: only that datasource, buckets and top errors', async () => {
    const res = await get(`datasources/${codeA}?${range}`, token);
    expect(res.status).toBe(200);
    expect(res.body.datasource).toEqual({ code: codeA, name: null });
    expect(res.body.totals).toMatchObject({ requests: 6, answered: 2, gap: 4, failed: 2, denied: 1, records: 8 });
    expect(res.body.totals.avgDurationMs).toBe(200);
    const ts = res.body.timeseries as { bucket: string; requests: number }[];
    expect(ts.find((b) => b.bucket === '2020-03-14T12')!.requests).toBe(2); // 05:00Z, 05:30Z
    expect(ts.find((b) => b.bucket === '2020-03-14T13')!.requests).toBe(2); // 06:00Z, 06:10Z
    expect(res.body.topErrors).toEqual(
      expect.arrayContaining([
        { errorCode: 'UPSTREAM_TIMEOUT', statusCode: 504, count: 1 },
        { errorCode: 'VALIDATION_ERROR', statusCode: 422, count: 1 },
        { errorCode: null, statusCode: 403, count: 1 },
      ]),
    );
    expect(res.body.topErrors).toHaveLength(3);
  });

  it('detail: unknown code returns zeros, not 404', async () => {
    const res = await get(`datasources/NOPE_${suffix}?${range}`, token);
    expect(res.status).toBe(200);
    expect(res.body.totals.requests).toBe(0);
    expect(res.body.topErrors).toEqual([]);
  });

  it('403 without permission, 401 without token', async () => {
    expect((await get(`overview?${range}`, noPermToken)).status).toBe(403);
    expect((await get(`datasources/${codeA}?${range}`, noPermToken)).status).toBe(403);
    expect((await get(`overview?${range}`)).status).toBe(401);
  });

  it('422 on invalid input', async () => {
    expect((await get('overview?preset=custom', token)).status).toBe(422);
    expect((await get('overview?preset=custom&from=2020-03-15&to=2020-03-14', token)).status).toBe(422);
    expect((await get('overview?preset=custom&from=2018-01-01&to=2020-03-14', token)).status).toBe(422);
    expect((await get('overview?preset=bogus', token)).status).toBe(422);
    expect((await get('datasources/bad%20code?preset=today', token)).status).toBe(422);
  });

  it('default preset (last_7d) works and returns previous period', async () => {
    const res = await get('overview', token);
    expect(res.status).toBe(200);
    expect(res.body.range.preset).toBe('last_7d');
    expect(res.body.range.granularity).toBe('day');
    expect(res.body.timeseries).toHaveLength(7);
    expect(res.body.previous.to).toBe(res.body.range.from);
    expect(Date.parse(res.body.range.from) - Date.parse(res.body.previous.from)).toBe(7 * 86_400_000);
    expect(typeof res.body.previous.totals.requests).toBe('number');
  });

  it.each([
    ['last_24h', 'hour', 24],
    ['last_30d', 'day', 30],
    ['last_90d', 'day', 90],
    ['today', 'hour', 24],
  ])('preset %s -> granularity %s with %i buckets', async (preset, granularity, n) => {
    const res = await get(`overview?preset=${preset}`, token);
    expect(res.status).toBe(200);
    expect(res.body.range.granularity).toBe(granularity);
    expect(res.body.timeseries).toHaveLength(n);
  });

  it('last_month works', async () => {
    const res = await get('overview?preset=last_month', token);
    expect(res.status).toBe(200);
    expect(res.body.range.granularity).toBe('day');
    expect(res.body.previous.to).toBe(res.body.range.from);
  });

  it('previous period: same datasource, window right before a custom range', async () => {
    const res = await get(`datasources/${codeA}?preset=custom&from=2020-03-15&to=2020-03-15`, token);
    expect(res.status).toBe(200);
    expect(res.body.totals.requests).toBe(1); // the 00:00 VN fixture row of 15/03
    expect(res.body.previous.from).toBe('2020-03-13T17:00:00.000Z');
    expect(res.body.previous.to).toBe('2020-03-14T17:00:00.000Z');
    expect(res.body.previous.totals).toMatchObject({ requests: 6, answered: 2, gap: 4, errors: 3 });
    const ov = await get('overview?preset=custom&from=2020-03-15&to=2020-03-15', token);
    expect(ov.body.previous.totals.requests).toBeGreaterThanOrEqual(8);
  });

  it('bucket edges follow Asia/Ho_Chi_Minh: hour, day and month rollover', async () => {
    const hour = await get(`datasources/${codeT}?preset=custom&from=2019-12-31&to=2020-01-01`, token);
    const h = Object.fromEntries(
      (hour.body.timeseries as { bucket: string; requests: number }[]).map((b) => [b.bucket, b.requests]),
    );
    expect(hour.body.range.granularity).toBe('hour');
    expect(h['2019-12-31T23']).toBe(1);
    expect(h['2020-01-01T00']).toBe(1);

    const day = await get(`datasources/${codeT}?preset=custom&from=2019-12-31&to=2020-02-01`, token);
    const d = Object.fromEntries(
      (day.body.timeseries as { bucket: string; requests: number }[]).map((b) => [b.bucket, b.requests]),
    );
    expect(day.body.range.granularity).toBe('day');
    expect(d).toMatchObject({ '2019-12-31': 1, '2020-01-01': 1, '2020-01-31': 1, '2020-02-01': 1 });

    const month = await get(`datasources/${codeT}?preset=custom&from=2019-12-01&to=2020-02-29&granularity=month`, token);
    const m = Object.fromEntries(
      (month.body.timeseries as { bucket: string; requests: number }[]).map((b) => [b.bucket, b.requests]),
    );
    expect(m).toEqual({ '2019-12': 1, '2020-01': 2, '2020-02': 1 });
  });

  it('manual granularity override and bucket cap (422)', async () => {
    const ok = await get('overview?preset=last_7d&granularity=hour', token);
    expect(ok.status).toBe(200);
    expect(ok.body.timeseries).toHaveLength(168);
    expect((await get('overview?preset=last_90d&granularity=hour', token)).status).toBe(422);
    expect((await get('overview?preset=last_7d&granularity=week', token)).status).toBe(422);
  });
});
