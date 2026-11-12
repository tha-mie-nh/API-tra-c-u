import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { STATS_COUNTER_HISTORY_FILTER, buildHistorySearchParams, vnBucketRange, type QueryStatsCounterKey } from '@app/shared';
import type { PrismaService } from '../src/prisma/prisma.service';
import { auth, bootApp, cleanupUsers, createRoleUser, toQueryLogData, type E2eUser, type RowInput } from './fixtures/query-log-e2e-fixtures';

type Made = E2eUser & { roleId: string };
const COUNTER_KEYS = Object.keys(STATS_COUNTER_HISTORY_FILTER) as QueryStatsCounterKey[];

/**
 * Drill-down contract: for every stats bucket x every counter, the History
 * list (via STATS_COUNTER_HISTORY_FILTER + vnBucketRange) returns exactly the
 * stats number. Boundary rows sit on 23:59:59.999 / 00:00 VN.
 */
describe('Stats <-> History reconciliation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const sfx = Date.now();
  const R = `E2E_REC_${sfx}`;
  let admin: Made;

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    admin = await createRoleUser(app, prisma, `REC_${sfx}`, ['admin:query_stats', 'history:view_all']);
    const ok = (at: string, recordCount: number | null, extra: Partial<RowInput> = {}): RowInput => ({ code: R, at, recordCount, statusCode: 200, durationMs: 100, ...extra });
    const rows: RowInput[] = [
      ok('2021-05-31T16:59:59.999Z', 1), // outside (before)
      ok('2021-06-30T16:59:59.999Z', 2),
      ok('2021-06-30T17:00:00.000Z', 0),
      ok('2021-07-14T16:59:59.999Z', null, { status: 'failed', statusCode: 504, errorCode: 'UPSTREAM_TIMEOUT' }),
      ok('2021-07-14T17:00:00.000Z', null, { status: 'denied', statusCode: 403 }),
      ok('2021-07-15T05:00:00.000Z', null),
      ok('2021-07-15T05:30:00.000Z', 3, { status: 'failed', statusCode: 422, errorCode: 'VALIDATION_ERROR' }), // failed WITH records
      ok('2021-07-15T16:59:59.999Z', 1),
      ok('2021-07-15T17:00:00.000Z', 1),
      ok('2021-07-19T16:59:59.999Z', null, { status: 'failed', statusCode: null, errorCode: null, durationMs: null }), // legacy
      ok('2021-07-31T16:59:59.999Z', 1),
      ok('2021-07-31T17:00:00.000Z', 0),
      ok('2021-08-10T03:00:00.000Z', null, { status: 'denied', statusCode: 403 }),
      ok('2021-08-10T03:01:00.000Z', null, { status: 'failed', statusCode: 502, errorCode: 'UPSTREAM_ERROR' }),
      ok('2021-08-10T03:02:00.000Z', null, { status: 'failed', statusCode: 502, errorCode: 'UPSTREAM_ERROR' }),
      ok('2021-09-08T16:59:59.999Z', 5),
      ok('2021-09-08T17:00:00.000Z', 5), // outside (after)
    ];
    await prisma.queryLog.createMany({ data: rows.map(toQueryLogData) });
  });

  afterAll(async () => {
    await prisma.queryLog.deleteMany({ where: { datasourceCode: R } });
    await cleanupUsers(prisma, [admin]);
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(`/api/v1/${path}`).set(auth(admin.token));
  const histTotal = async (params: Record<string, string | undefined>) => {
    const res = await get(`history?${buildHistorySearchParams({ ...params, datasourceCode: R }).toString()}&pageSize=1`);
    expect(res.status).toBe(200);
    return res.body.total as number;
  };

  it.each([
    ['hour', '2021-07-15', '2021-07-15'],
    ['day', '2021-07-10', '2021-07-19'],
    ['month', '2021-06-01', '2021-09-08'],
  ])('%s granularity: every bucket x every counter equals History total', async (granularity, from, to) => {
    const res = await get(`admin/query-stats/datasources/${R}?preset=custom&from=${from}&to=${to}`);
    expect(res.status).toBe(200);
    expect(res.body.range.granularity).toBe(granularity);
    const buckets = res.body.timeseries as (Record<string, number | string | null> & { bucket: string })[];
    let checked = 0;
    for (const b of buckets) {
      // Edge buckets (month/day) can extend past the requested range: drill-down must clamp to it.
      const bucketRange = vnBucketRange(b.bucket, granularity as 'hour' | 'day' | 'month');
      const range = {
        from: bucketRange.from > res.body.range.from ? bucketRange.from : res.body.range.from,
        to: bucketRange.to < res.body.range.to ? bucketRange.to : res.body.range.to,
      };
      for (const key of COUNTER_KEYS) {
        const n = await histTotal({ ...STATS_COUNTER_HISTORY_FILTER[key], ...range });
        expect({ bucket: b.bucket, key, n }).toEqual({ bucket: b.bucket, key, n: b[key] });
        checked++;
      }
    }
    expect(checked).toBe(buckets.length * COUNTER_KEYS.length);
    expect(buckets.reduce((s, b) => s + (b.requests as number), 0)).toBeGreaterThan(0);

    // whole range + summary
    const t = res.body.totals as Record<string, number>;
    const sum = (await get(`history/summary?datasourceCode=${R}&from=${from}&to=${to}`)).body;
    expect(sum).toMatchObject({ total: t.requests, success: t.success, failed: t.failed, denied: t.denied, answered: t.answered, gap: t.gap, empty: t.empty });
    for (const key of COUNTER_KEYS) {
      expect(await histTotal({ ...STATS_COUNTER_HISTORY_FILTER[key], from, to })).toBe(t[key]);
    }
  });

  it('exact expectations for the month range (guards against symmetric bugs)', async () => {
    const t = (await get(`admin/query-stats/datasources/${R}?preset=custom&from=2021-06-01&to=2021-09-08`)).body.totals;
    expect(t).toMatchObject({ requests: 15, answered: 5, gap: 10, success: 8, empty: 3, failed: 5, denied: 2, errors: 7 });
  });

  it('top errors: each item drills to a History total equal to its count', async () => {
    const res = await get(`admin/query-stats/datasources/${R}?preset=custom&from=2021-06-01&to=2021-09-08`);
    const top = res.body.topErrors as { errorCode: string | null; statusCode: number | null; count: number }[];
    expect(top.length).toBeGreaterThanOrEqual(4); // timeout, validation, 502, 403 (null code), legacy null/null
    for (const e of top) {
      const n = await histTotal({
        status: 'failed,denied',
        errorCode: e.errorCode ?? '__null__',
        statusCode: e.statusCode === null ? '__null__' : String(e.statusCode),
        from: '2021-06-01',
        to: '2021-09-08',
      });
      expect(n).toBe(e.count);
    }
  });
});
