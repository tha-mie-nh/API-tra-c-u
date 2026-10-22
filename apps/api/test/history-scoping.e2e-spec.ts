import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * Phase 05 Risk Assessment #1 (the single most likely place to introduce a
 * horizontal privilege-escalation bug): `GET /history[/:id]` MUST force the
 * caller's own userId server-side for a `history:view_own`-only caller,
 * NEVER trusting a client-supplied `?userId=`. This is the mandated e2e test
 * from the task brief (case a).
 */
describe('History scoping (e2e) — horizontal privilege escalation', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = Date.now();
  const viewOwnRoleCode = `E2E_HIST_OWN_ROLE_${suffix}`;
  const viewAllRoleCode = `E2E_HIST_ALL_ROLE_${suffix}`;
  const noPermRoleCode = `E2E_HIST_NOPERM_ROLE_${suffix}`;
  const usernameA = `e2e_hist_user_a_${suffix}`;
  const usernameB = `e2e_hist_user_b_${suffix}`;
  const auditorUsername = `e2e_hist_auditor_${suffix}`;
  const noPermUsername = `e2e_hist_noperm_${suffix}`;
  const password = 'HistoryE2E#Passw0rd123';

  let userA: { id: string };
  let userB: { id: string };
  let tokenA: string;
  let tokenB: string;
  let auditorToken: string;
  let noPermToken: string;
  let userAHistoryId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);

    const citizenBasicPerm = await prisma.permission.findUniqueOrThrow({ where: { code: 'api:citizen_basic' } });
    const viewOwnPerm = await prisma.permission.findUniqueOrThrow({ where: { code: 'history:view_own' } });
    const viewAllPerm = await prisma.permission.findUniqueOrThrow({ where: { code: 'history:view_all' } });

    const viewOwnRole = await prisma.role.create({ data: { code: viewOwnRoleCode, name: 'E2E History view_own' } });
    await prisma.rolePermission.createMany({
      data: [
        { roleId: viewOwnRole.id, permissionId: citizenBasicPerm.id },
        { roleId: viewOwnRole.id, permissionId: viewOwnPerm.id },
      ],
    });

    const viewAllRole = await prisma.role.create({ data: { code: viewAllRoleCode, name: 'E2E History view_all' } });
    await prisma.rolePermission.create({ data: { roleId: viewAllRole.id, permissionId: viewAllPerm.id } });

    const noPermRole = await prisma.role.create({ data: { code: noPermRoleCode, name: 'E2E History no-perm' } });

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    userA = await prisma.user.create({ data: { username: usernameA, fullName: 'E2E History User A', passwordHash } });
    await prisma.userRole.create({ data: { userId: userA.id, roleId: viewOwnRole.id } });

    userB = await prisma.user.create({ data: { username: usernameB, fullName: 'E2E History User B', passwordHash } });
    await prisma.userRole.create({ data: { userId: userB.id, roleId: viewOwnRole.id } });

    const auditor = await prisma.user.create({
      data: { username: auditorUsername, fullName: 'E2E History Auditor', passwordHash },
    });
    await prisma.userRole.create({ data: { userId: auditor.id, roleId: viewAllRole.id } });

    const noPermUser = await prisma.user.create({
      data: { username: noPermUsername, fullName: 'E2E History No-Perm', passwordHash },
    });
    await prisma.userRole.create({ data: { userId: noPermUser.id, roleId: noPermRole.id } });

    const loginAndToken = async (username: string): Promise<string> => {
      const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
      return res.body.accessToken as string;
    };
    tokenA = await loginAndToken(usernameA);
    tokenB = await loginAndToken(usernameB);
    auditorToken = await loginAndToken(auditorUsername);
    noPermToken = await loginAndToken(noPermUsername);

    // Each user produces exactly one query_logs row of their own, via the
    // REAL query pipeline (not inserted directly) — so this test exercises
    // the full Phase 05 stack end to end, not just HistoryService in isolation.
    const queryA = await request(app.getHttpServer())
      .post('/api/v1/query/CITIZEN_BASIC')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ params: { fullName: 'Nguyễn' } });
    expect(queryA.status).toBe(200);

    await request(app.getHttpServer())
      .post('/api/v1/query/CITIZEN_BASIC')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ params: { fullName: 'Trần' } });

    const historyA = await request(app.getHttpServer()).get('/api/v1/history').set('Authorization', `Bearer ${tokenA}`);
    userAHistoryId = historyA.body.items[0].id;
  });

  afterAll(async () => {
    await prisma.queryLog.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { username: { in: [usernameA, usernameB, auditorUsername, noPermUsername] } } });
    await prisma.role.deleteMany({ where: { code: { in: [viewOwnRoleCode, viewAllRoleCode, noPermRoleCode] } } });
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('a view_own-only user sees ONLY their own history, even with no filter', async () => {
    const res = await request(server()).get('/api/v1/history').set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((item: { userId: string }) => item.userId === userB.id)).toBe(true);
  });

  it('SECURITY: a view_own-only user passing ?userId=<another user> still only gets their OWN rows back — the server ignores the client-supplied userId', async () => {
    const res = await request(server())
      .get('/api/v1/history')
      .query({ userId: userA.id })
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    // Every returned row belongs to B (the caller), never A — proves the
    // server forces the scope instead of trusting the query param.
    expect(res.body.items.every((item: { userId: string }) => item.userId === userB.id)).toBe(true);
    expect(res.body.items.some((item: { userId: string }) => item.userId === userA.id)).toBe(false);
  });

  it('SECURITY: a view_own-only user fetching another user\'s history/:id gets 404 (not 403) — existence is not confirmed', async () => {
    const res = await request(server()).get(`/api/v1/history/${userAHistoryId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('a view_own-only user CAN fetch their own history/:id', async () => {
    const ownHistory = await request(server()).get('/api/v1/history').set('Authorization', `Bearer ${tokenB}`);
    const ownId = ownHistory.body.items[0].id;
    const res = await request(server()).get(`/api/v1/history/${ownId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userB.id);
  });

  it('a view_all (auditor) caller sees BOTH users\' rows with no filter', async () => {
    const res = await request(server()).get('/api/v1/history').set('Authorization', `Bearer ${auditorToken}`);
    expect(res.status).toBe(200);
    const userIds = new Set(res.body.items.map((item: { userId: string }) => item.userId));
    expect(userIds.has(userA.id)).toBe(true);
    expect(userIds.has(userB.id)).toBe(true);
  });

  it('a view_all (auditor) caller\'s explicit ?userId= filter IS honored (only view_all can legitimately narrow to another user)', async () => {
    const res = await request(server())
      .get('/api/v1/history')
      .query({ userId: userA.id })
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((item: { userId: string }) => item.userId === userA.id)).toBe(true);
  });

  it('a view_all (auditor) caller CAN fetch another user\'s history/:id', async () => {
    const res = await request(server()).get(`/api/v1/history/${userAHistoryId}`).set('Authorization', `Bearer ${auditorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userA.id);
  });

  it('denies (403) a user with NEITHER history:view_own NOR history:view_all', async () => {
    const res = await request(server()).get('/api/v1/history').set('Authorization', `Bearer ${noPermToken}`);
    expect(res.status).toBe(403);
  });
});
