import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { QueryLogService } from '../src/history/query-log.service';
import { auth, bootApp, cleanupUsers, createRoleUser, type E2eUser } from './fixtures/query-log-e2e-fixtures';
import { insertRows, insightsAt } from './fixtures/query-insights-e2e-fixtures';

type Made = E2eUser & { roleId: string };

/** M1 (invalid IP must not drop the log), M2 (::ffff: = IPv4 everywhere), M4 (gap incl. NULL record_count). Isolated by username prefix + 2018 window. */
describe('query_logs IP normalisation + gap metric (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const sfx = Date.now();
  const P = `qip${sfx}`;
  const day = '2018-05-07';
  const code = `E2E_QIP_${sfx}`;
  let admin: Made;
  const ids: Record<string, string> = {};
  const get = (path: string) => request(app.getHttpServer()).get(`/api/v1/${path}`).set(auth(admin.token));
  const base = `username=${P}&from=${day}&to=${day}`;

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    admin = await createRoleUser(app, prisma, `QIP_${sfx}`, ['history:view_all']);
    for (const k of ['a', 'b', 'g']) ids[k] = (await prisma.user.create({ data: { username: `${P}_${k}`, fullName: k, passwordHash: 'x' } })).id;
  });

  afterAll(async () => {
    await prisma.queryLog.deleteMany({ where: { usernameSnapshot: { contains: P } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await cleanupUsers(prisma, [admin]);
    await app.close();
  });

  describe('M1/M2 write path (QueryLogService.record)', () => {
    const rec = (ip: string | null | undefined, tag: string) =>
      app.get(QueryLogService, { strict: false }).record({
        userId: ids.a!, username: `${P}_w_${tag}`, datasourceCode: code, status: 'success', statusCode: 200, recordCount: 1, ip,
      });
    const stored = async (tag: string) => prisma.$queryRaw<{ ip: string | null }[]>`SELECT host(ip) AS ip FROM app.query_logs WHERE username_snapshot = ${`${P}_w_${tag}`}`;

    it('garbage IP: row is still written with ip NULL', async () => {
      await rec('foo, 1.2.3.4', 'bad');
      expect(await stored('bad')).toEqual([{ ip: null }]);
    });
    it('::ffff:x.x.x.x stored as plain IPv4', async () => {
      await rec('::ffff:10.77.0.9', 'mapped');
      expect(await stored('mapped')).toEqual([{ ip: '10.77.0.9' }]);
    });
    it('valid IPv4 / IPv6 / missing are preserved', async () => {
      await rec('10.77.0.8', 'v4');
      await rec('2001:db8::7', 'v6');
      await rec(undefined, 'none');
      expect(await stored('v4')).toEqual([{ ip: '10.77.0.8' }]);
      expect(await stored('v6')).toEqual([{ ip: '2001:db8::7' }]);
      expect(await stored('none')).toEqual([{ ip: null }]);
    });
  });

  describe('M2 read path with legacy ::ffff: rows', () => {
    beforeAll(async () => {
      const row = (k: string, ip: string, m: number) => ({
        userId: ids[k]!, username: `${P}_${k}`, code, at: insightsAt(day, `10:0${m}:00`), recordCount: 1, statusCode: 200, ip,
      });
      await insertRows(prisma, [row('a', '10.88.0.1', 1), row('b', '::ffff:10.88.0.1', 2), row('b', '10.88.0.1', 3), row('a', '10.88.0.2', 4)]);
    });

    it('/history?ip= matches both spellings (plain and mapped query)', async () => {
      for (const ip of ['10.88.0.1', '::ffff:10.88.0.1']) {
        const res = await get(`history?${base}&ip=${encodeURIComponent(ip)}`);
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(3);
      }
    });
    it('ip activity treats both as one host', async () => {
      const res = await get(`admin/query-insights/ips/10.88.0.1/activity?${base}`);
      expect(res.status).toBe(200);
      expect(res.body.totals.requests).toBe(3);
      expect(res.body.users.map((u: { count: number }) => u.count).sort()).toEqual([1, 2]);
    });
    it('shared-IP groups collapse into one plain-IPv4 entry; user ip list collapses too', async () => {
      const res = await get(`admin/query-insights/anomalies?${base}`);
      expect(res.status).toBe(200);
      const shared = res.body.sharedIps.filter((r: { ip: string }) => r.ip.includes('10.88.0.1'));
      expect(shared).toHaveLength(1);
      expect(shared[0]).toMatchObject({ ip: '10.88.0.1', distinctUsers: 2, requests: 3 });
      const act = await get(`admin/query-insights/users/${ids.b}/activity?${base}`);
      expect(act.body.ips).toEqual([expect.objectContaining({ ip: '10.88.0.1', count: 2 })]);
    });
  });

  describe('M4 gap metric', () => {
    it('top-users metric=gap counts success rows with NULL record_count; equals /history?outcome=gap', async () => {
      const row = (m: number, recordCount: number | null) => ({
        userId: ids.g!, username: `${P}_g`, code, at: insightsAt(day, `11:0${m}:00`), recordCount, statusCode: 200,
      });
      // 1 answered, 1 empty (0), 2 NULL record_count => gap = 3
      await insertRows(prisma, [row(1, 5), row(2, 0), row(3, null), row(4, null)]);
      const q = `username=${P}_g&from=${day}&to=${day}`;
      const top = await get(`admin/query-insights/top-users?${q}&metric=gap`);
      expect(top.status).toBe(200);
      expect(top.body).toHaveLength(1);
      const r = top.body[0];
      expect(r.requests - r.answered).toBe(3);
      const hist = await get(`history?${q}&outcome=gap`);
      expect(hist.body.total).toBe(3);
    });
    it('a user whose ONLY gaps are NULL record_count still ranks under metric=gap', async () => {
      await prisma.queryLog.deleteMany({ where: { usernameSnapshot: `${P}_g` } });
      await insertRows(prisma, [{ userId: ids.g!, username: `${P}_g`, code, at: insightsAt(day, '12:00:00'), recordCount: null, statusCode: 200 }]);
      const top = await get(`admin/query-insights/top-users?username=${P}_g&from=${day}&to=${day}&metric=gap`);
      expect(top.body).toHaveLength(1);
    });
  });
});
