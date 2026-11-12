import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { QUERY_INSIGHTS_RULES } from '@app/shared';
import type { PrismaService } from '../src/prisma/prisma.service';
import { auth, bootApp, cleanupUsers, createRoleUser, type E2eUser } from './fixtures/query-log-e2e-fixtures';
import { burst, insertRows, insightsAt, parseCsv, waitAudit, type InsightsRow } from './fixtures/query-insights-e2e-fixtures';

type Made = E2eUser & { roleId: string };
type Spike = { username: string; day: string; count: number; baselineAvg: number };

/** Anomaly rules on controlled 2019-03 data (Mon 2019-03-04 ... Sat 2019-03-23). Rows isolated by username prefix. */
describe('Query insights anomalies (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const sfx = Date.now();
  const P = `qa${sfx}`;
  const CCCD1 = '079099123456';
  const CCCD2 = '079099654321';
  const CCCD3 = '07909977777X';
  const CCCD4 = '079099444444';
  const CCCD5 = '079099555555';
  const ids: Record<string, string> = {};
  let full: Made; let masked: Made; let ownOnly: Made;
  const range = `username=${P}&from=2019-03-10&to=2019-03-25`;
  const get = (path: string, token: string) => request(app.getHttpServer()).get(`/api/v1/admin/query-insights/${path}`).set(auth(token));
  const anomalies = async (q: string, token = full.token) => {
    const res = await get(`anomalies?${q}`, token);
    expect(res.status).toBe(200);
    return res.body;
  };
  const name = (k: string) => `${P}_${k}`;
  const u = (k: string) => ({ userId: ids[k]!, username: name(k) });
  const baselineDays = ['2019-03-13', '2019-03-14', '2019-03-15', '2019-03-16', '2019-03-17', '2019-03-18', '2019-03-19'];
  /** One baseline row per day with `perDay` rows each (optionally an extra on first day). */
  const baseline = (k: string, perDay: number, extraFirst = 0): InsightsRow[] =>
    baselineDays.flatMap((d, i) => burst({ ...u(k), code: 'E2E_QA_BASE' }, d, perDay + (i === 0 ? extraFirst : 0)));
  const spikeDay = (k: string, n: number, d = '2019-03-20'): InsightsRow[] => burst({ ...u(k), code: 'E2E_QA_SPIKE' }, d, n);

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    full = await createRoleUser(app, prisma, `QA_FULL_${sfx}`, ['history:view_all', 'history:view_sensitive', 'history:export']);
    masked = await createRoleUser(app, prisma, `QA_MASK_${sfx}`, ['history:view_all', 'history:export']);
    ownOnly = await createRoleUser(app, prisma, `QA_OWN_${sfx}`, ['history:view_own']);
    const keys = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'i1', 'i2', 'i3'];
    for (const k of keys) ids[k] = (await prisma.user.create({ data: { username: name(k), fullName: k, passwordHash: 'x' } })).id;

    const idRow = (k: string, code: string, citizenId: string, extra: Partial<InsightsRow> = {}): InsightsRow => ({
      ...u(k), code, at: insightsAt('2019-03-15', '10:00:00'), recordCount: 1, statusCode: 200, params: { citizenId }, ip: k === 'i3' ? '10.9.1.2' : '10.9.1.1', ...extra,
    });
    const rows: InsightsRow[] = [
      // spikes
      ...baseline('s1', 1), ...spikeDay('s1', 25), // 25 >= 20 and >= 3x (avg 1) -> flagged
      ...baseline('s2', 10), ...spikeDay('s2', 25), // avg 10 -> 25 < 30 -> not flagged
      ...spikeDay('s3', 20), // new user, exactly 20 -> flagged (baseline 0)
      ...spikeDay('s4', 19), // 19 -> not flagged
      ...baseline('s5', 7), ...spikeDay('s5', 21), // sum 49 -> 21*7 = 147 >= 3*49 -> flagged (boundary equal)
      ...baseline('s6', 7, 1), ...spikeDay('s6', 21), // sum 50 -> 147 < 150 -> not flagged
      ...burst({ ...u('s7'), code: 'E2E_QA_SPIKE' }, '2019-03-20', 20, 23).map((r, i) => ({ ...r, at: insightsAt('2019-03-20', `23:59:${String(i).padStart(2, '0')}`) })), // VN day 03-20
      ...burst({ ...u('s8'), code: 'E2E_QA_SPIKE' }, '2019-03-21', 20, 0).map((r, i) => ({ ...r, at: insightsAt('2019-03-21', `00:00:${String(i).padStart(2, '0')}`) })), // VN day 03-21
      // off-hours (Wed 2019-03-20 unless noted)
      { ...u('o1'), code: 'E2E_QA_OFF', at: insightsAt('2019-03-20', '17:59:59') },
      { ...u('o2'), code: 'E2E_QA_OFF', at: insightsAt('2019-03-20', '18:00:00') },
      { ...u('o3'), code: 'E2E_QA_OFF', at: insightsAt('2019-03-20', '06:59:59') },
      { ...u('o4'), code: 'E2E_QA_OFF', at: insightsAt('2019-03-20', '07:00:00') },
      { ...u('o5'), code: 'E2E_QA_OFF', at: insightsAt('2019-03-23', '10:00:00') }, // Saturday
      { ...u('o6'), code: 'E2E_QA_OFF', at: insightsAt('2019-03-22', '23:59:00') }, // Fri 23:59 -> off
      { ...u('o6'), code: 'E2E_QA_OFF', at: insightsAt('2019-03-22', '10:00:00') }, // Fri working hour
      { ...u('o7'), code: 'E2E_QA_OFF', at: insightsAt('2019-03-23', '00:00:00') }, // Sat 00:00 -> off, belongs to 03-23
      // shared identity: CCCD1 x3 users over 2 datasources (i1 twice)
      idRow('i1', 'PASSPORT_INFO', CCCD1), idRow('i1', 'PASSPORT_INFO', CCCD1, { at: insightsAt('2019-03-15', '11:00:00') }),
      idRow('i2', 'DRIVER_LICENSE', CCCD1, { ip: '10.9.1.1' }), idRow('i3', 'PASSPORT_INFO', CCCD1, { ip: '10.9.1.2' }),
      // CCCD2 only 2 users -> not flagged
      idRow('i1', 'PASSPORT_INFO', CCCD2), idRow('i2', 'PASSPORT_INFO', CCCD2),
      // legacy masked value shared by 3 -> excluded
      idRow('i1', 'PASSPORT_INFO', '********3456'), idRow('i2', 'PASSPORT_INFO', '********3456'), idRow('i3', 'PASSPORT_INFO', '********3456'),
      // normalisation: trim + upper
      idRow('i1', 'PASSPORT_INFO', '07909977777x '), idRow('i2', 'PASSPORT_INFO', ` ${CCCD3}`), idRow('i3', 'PASSPORT_INFO', CCCD3),
      // denied third user -> only 2 counted
      idRow('i1', 'PASSPORT_INFO', CCCD4), idRow('i2', 'PASSPORT_INFO', CCCD4), idRow('i3', 'PASSPORT_INFO', CCCD4, { status: 'denied', recordCount: null, statusCode: 403 }),
      // datasource with no sensitive flag (BHXH_LOOKUP.cccd) -> not detected
      ...['i1', 'i2', 'i3'].map((k) => ({ ...u(k), code: 'BHXH_LOOKUP', at: insightsAt('2019-03-15', '12:00:00'), recordCount: 1, params: { cccd: CCCD5 } })),
      // non-sensitive field same value across 3 users -> not detected
      ...['i1', 'i2', 'i3'].map((k) => ({ ...u(k), code: 'PASSPORT_INFO', at: insightsAt('2019-03-15', '12:30:00'), recordCount: 1, params: { fullName: 'SAME NAME' } })),
    ];
    await insertRows(prisma, rows);
  });

  afterAll(async () => {
    await prisma.queryLog.deleteMany({ where: { usernameSnapshot: { contains: P } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await cleanupUsers(prisma, [full, masked, ownOnly]);
    await app.close();
  });

  it('authz + validation: view_own 403, range required, <= 90 days', async () => {
    expect((await get(`anomalies?${range}`, ownOnly.token)).status).toBe(403);
    expect((await request(app.getHttpServer()).get(`/api/v1/admin/query-insights/anomalies?${range}`)).status).toBe(401);
    expect((await get(`anomalies?username=${P}`, full.token)).status).toBe(422);
    expect((await get(`anomalies?username=${P}&from=2019-03-01&to=2019-05-30`, full.token)).status).toBe(422);
    expect((await get(`anomalies?username=${P}&from=2019-03-01&to=2019-05-29`, full.token)).status).toBe(200);
  });

  it('returns the rules used', async () => {
    expect((await anomalies(range)).rules).toEqual(QUERY_INSIGHTS_RULES);
  });

  it('spikes: threshold and 3x-baseline boundaries; baseline taken from days before the range', async () => {
    const spikes = (await anomalies(range)).spikes as Spike[];
    const by = Object.fromEntries(spikes.filter((s) => s.day === '2019-03-20' || s.username === name('s8')).map((s) => [s.username, s]));
    expect(by[name('s1')]).toMatchObject({ day: '2019-03-20', count: 25, baselineAvg: 1 });
    expect(by[name('s2')]).toBeUndefined(); // 25 < 3 x 10
    expect(by[name('s3')]).toMatchObject({ count: 20, baselineAvg: 0 }); // exactly 20, new user
    expect(by[name('s4')]).toBeUndefined(); // 19
    expect(by[name('s5')]).toMatchObject({ count: 21, baselineAvg: 7 }); // 21 == 3 x 7 (equal => flagged)
    expect(by[name('s6')]).toBeUndefined(); // baseline 50/7 -> 3x = 21.43 > 21
    expect(by[name('s7')]).toMatchObject({ day: '2019-03-20', count: 20 }); // 23:59 VN stays on the 20th
    expect(by[name('s8')]).toMatchObject({ day: '2019-03-21', count: 20 }); // 00:00 VN is the 21st
    for (let i = 1; i < spikes.length; i++) expect(spikes[i - 1]!.count).toBeGreaterThanOrEqual(spikes[i]!.count);
  });

  it('spikes: days before the requested range are never reported', async () => {
    const spikes = (await anomalies(`username=${P}&from=2019-03-21&to=2019-03-25`)).spikes as Spike[];
    expect(spikes.every((s) => s.day >= '2019-03-21')).toBe(true);
    expect(spikes.map((s) => s.username)).toEqual([name('s8')]);
  });

  it('off-hours: 17:59:59 not, 18:00:00 yes, 06:59:59 yes, 07:00:00 not, Saturday yes, 23:59 Fri / 00:00 Sat yes', async () => {
    const rows = (await anomalies(range)).offHours as { username: string; offHoursCount: number; total: number; ratio: number }[];
    const by = Object.fromEntries(rows.map((r) => [r.username, r]));
    expect(by[name('o1')]).toBeUndefined();
    expect(by[name('o2')]).toMatchObject({ offHoursCount: 1, total: 1, ratio: 1 });
    expect(by[name('o3')]).toMatchObject({ offHoursCount: 1 });
    expect(by[name('o4')]).toBeUndefined();
    expect(by[name('o5')]).toMatchObject({ offHoursCount: 1 });
    expect(by[name('o6')]).toMatchObject({ offHoursCount: 1, total: 2, ratio: 0.5 });
    expect(by[name('o7')]).toMatchObject({ offHoursCount: 1 });
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.offHoursCount).toBeGreaterThanOrEqual(rows[i]!.offHoursCount);
  });

  it('off-hours: Sat 00:00 VN is excluded by to=2019-03-22 and included by from=2019-03-23', async () => {
    const names = async (q: string) => ((await anomalies(`username=${P}_o&${q}`)).offHours as { username: string }[]).map((r) => r.username);
    expect(await names('from=2019-03-22&to=2019-03-22')).toEqual([name('o6')]);
    expect(await names('from=2019-03-23&to=2019-03-23')).toEqual(expect.arrayContaining([name('o5'), name('o7')]));
    expect(await names('from=2019-03-23&to=2019-03-23')).not.toContain(name('o6'));
  });

  it('off-hours drill-down: offHours=true filter on /history gives the same count', async () => {
    const rows = (await anomalies(range)).offHours as { userId: string; offHoursCount: number }[];
    for (const r of rows.filter((x) => x.userId === ids.o6 || x.userId === ids.s7)) {
      const h = await get('top-users?' + `${range}&userId=${r.userId}&offHours=true`, full.token);
      expect(h.body[0].requests).toBe(r.offHoursCount);
    }
  });

  it('shared identities: >=3 users, trim+upper, excludes masked/denied/non-sensitive/undeclared, exact request counts', async () => {
    const rows = (await anomalies(range)).sharedIdentities as {
      fieldNames: string[]; valueDisplay: string; datasourceCodes: string[]; distinctUsers: number; requests: number;
      users: { username: string; count: number }[];
    }[];
    expect(rows).toHaveLength(2);
    const c1 = rows.find((r) => r.valueDisplay === CCCD1)!;
    expect(c1).toMatchObject({ fieldNames: ['citizenId'], datasourceCodes: ['DRIVER_LICENSE', 'PASSPORT_INFO'], distinctUsers: 3, requests: 4 });
    expect(c1.users.map((x) => [x.username, x.count])).toEqual([[name('i1'), 2], [name('i2'), 1], [name('i3'), 1]]);
    expect(rows.find((r) => r.valueDisplay === CCCD3)).toMatchObject({ distinctUsers: 3, requests: 3 });
    const text = JSON.stringify(rows);
    for (const hidden of [CCCD2, CCCD4, CCCD5, 'SAME NAME']) expect(text).not.toContain(hidden);
  });

  it('shared identities are masked without history:view_sensitive (response + CSV) and never in audit', async () => {
    const m = await anomalies(range, masked.token);
    const text = JSON.stringify(m);
    expect(text).not.toContain(CCCD1);
    expect(text).not.toContain(CCCD3);
    expect(m.sharedIdentities.map((r: { valueDisplay: string }) => r.valueDisplay).sort()).toEqual(['********3456', '********777X']);
    const res = await get(`export.csv?${range}&table=anomalies-shared-identities`, masked.token).buffer(true).parse((r, cb) => {
      let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => cb(null, d));
    });
    expect(res.status).toBe(200);
    expect(res.body as string).not.toContain(CCCD1);
    expect(res.body as string).toContain('********3456');
    const full1 = await get(`export.csv?${range}&table=anomalies-shared-identities`, full.token).buffer(true).parse((r, cb) => {
      let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => cb(null, d));
    });
    expect(full1.body as string).toContain(CCCD1);
    for (const action of ['query_insights.view_anomalies', 'query_insights.export_csv']) {
      const a = await waitAudit(prisma, action, masked.id);
      expect(a).not.toBeNull();
      const json = JSON.stringify(a!.after);
      expect(json).not.toContain(CCCD1);
      expect(json).not.toContain(CCCD3);
      expect(json).not.toContain(name('i1'));
      expect((a!.after as { filters: object }).filters).toMatchObject({ username: P, from: '2019-03-10', to: '2019-03-25' });
    }
    const fa = await waitAudit(prisma, 'query_insights.export_csv', full.id);
    expect(fa!.after).toMatchObject({ table: 'anomalies-shared-identities', rows: 2 });
  });

  it('shared IPs: >=2 distinct users (excludes single-user IP)', async () => {
    const rows = (await anomalies(`username=${P}_i&from=2019-03-15&to=2019-03-15`)).sharedIps as { ip: string; distinctUsers: number; usernames: string[] }[];
    expect(rows.map((r) => r.ip)).toEqual(['10.9.1.1']);
    expect(rows[0]).toMatchObject({ distinctUsers: 2, usernames: [name('i1'), name('i2')] });
  });

  it('CSV anomaly tables: spikes/off-hours/shared-ips match JSON row counts', async () => {
    const json = await anomalies(range);
    const counts: Record<string, number> = { 'anomalies-spikes': json.spikes.length, 'anomalies-off-hours': json.offHours.length, 'anomalies-shared-ips': json.sharedIps.length };
    for (const [table, n] of Object.entries(counts)) {
      const res = await get(`export.csv?${range}&table=${table}`, full.token).buffer(true).parse((r, cb) => {
        let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => cb(null, d));
      });
      expect(parseCsv((res.body as string).slice(1))).toHaveLength(n + 1);
    }
  });
});
