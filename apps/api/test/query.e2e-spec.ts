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
 * Phase 05 Implementation Step 11 (e2e, real Postgres — no mocks of infra):
 * `POST /query/:code` orchestration — happy path, validation errors,
 * permission denial (+ denied log row), and upstream error/timeout
 * translation (via MockInfoAdapter's `__FAIL__`/`__SLOW__` magic values).
 * `CITIZEN_BASIC` is a real config.json datasource (transport.kind=mock).
 */
describe('POST /query/:code (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = Date.now();
  const roleCode = `E2E_QUERY_ROLE_${suffix}`;
  const noPermRoleCode = `E2E_QUERY_NOPERM_ROLE_${suffix}`;
  const username = `e2e_query_user_${suffix}`;
  const noPermUsername = `e2e_query_noperm_${suffix}`;
  const password = 'QueryE2E#Passw0rd123';

  let accessToken: string;
  let noPermAccessToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);

    // Real (auto-synced by PermissionSyncService at boot) api:* permission
    // row — grant it to a dedicated test role, never touch the shared
    // OPERATOR role.
    const citizenBasicPerm = await prisma.permission.findUniqueOrThrow({ where: { code: 'api:citizen_basic' } });
    const role = await prisma.role.create({ data: { code: roleCode, name: 'E2E Query Role' } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: citizenBasicPerm.id } });

    const noPermRole = await prisma.role.create({ data: { code: noPermRoleCode, name: 'E2E Query No-Perm Role' } });

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({ data: { username, fullName: 'E2E Query User', passwordHash } });
    userId = user.id;
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

    const noPermUser = await prisma.user.create({
      data: { username: noPermUsername, fullName: 'E2E Query No-Perm User', passwordHash },
    });
    await prisma.userRole.create({ data: { userId: noPermUser.id, roleId: noPermRole.id } });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
    accessToken = loginRes.body.accessToken;
    const noPermLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: noPermUsername, password });
    noPermAccessToken = noPermLoginRes.body.accessToken;
  });

  afterAll(async () => {
    await prisma.queryLog.deleteMany({ where: { userId: { in: [userId] } } });
    await prisma.user.deleteMany({ where: { username: { in: [username, noPermUsername] } } });
    await prisma.role.deleteMany({ where: { code: { in: [roleCode, noPermRoleCode] } } });
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('rejects an unauthenticated request', async () => {
    const res = await request(server()).post('/api/v1/query/CITIZEN_BASIC').send({ params: {} });
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown datasource code', async () => {
    const res = await request(server())
      .post('/api/v1/query/NOT_A_REAL_DATASOURCE')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ params: {} });
    expect(res.status).toBe(404);
  });

  it('executes a query happy path: grouped envelope shape, X-Request-Id header, and a success query_logs row', async () => {
    const res = await request(server())
      .post('/api/v1/query/CITIZEN_BASIC')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ params: { fullName: 'Nguyễn' } });

    expect(res.status).toBe(200);
    expect(res.body.datasource).toBe('CITIZEN_BASIC');
    expect(res.body.type).toBe('info');
    expect(Array.isArray(res.body.groups)).toBe(true);
    expect(res.body.page).toMatchObject({ page: 1, truncated: false });
    expect(typeof res.headers['x-request-id']).toBe('string');
    // Internal output fields (none configured for CITIZEN_BASIC) never leak — columns match configured, non-internal fields.
    expect(res.body.columns.map((c: { name: string }) => c.name)).toContain('fullName');

    const log = await prisma.queryLog.findFirst({
      where: { userId, datasourceCode: 'CITIZEN_BASIC', status: QueryStatus.SUCCESS },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(log?.querySummary).toContain('Nguyễn');
    expect(log?.recordCount).toBe(res.body.page.returned);
  });

  it('returns 422 VALIDATION_ERROR with per-field details when atLeastOneOf is violated, and logs a failed row', async () => {
    const res = await request(server())
      .post('/api/v1/query/CITIZEN_BASIC')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ params: {} });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const log = await prisma.queryLog.findFirst({
      where: { userId, datasourceCode: 'CITIZEN_BASIC', status: QueryStatus.FAILED, errorCode: 'VALIDATION_ERROR' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
  });

  it('denies (403) a user without the datasource permission and writes a denied query_logs row', async () => {
    const res = await request(server())
      .post('/api/v1/query/CITIZEN_BASIC')
      .set('Authorization', `Bearer ${noPermAccessToken}`)
      .send({ params: { fullName: 'Nguyễn' } });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_API');

    const deniedLog = await prisma.queryLog.findFirst({
      where: { usernameSnapshot: noPermUsername, status: QueryStatus.DENIED, datasourceCode: 'CITIZEN_BASIC' },
      orderBy: { createdAt: 'desc' },
    });
    expect(deniedLog).not.toBeNull();
  });

  it('translates a mock-adapter injected upstream failure to 502 UPSTREAM_ERROR and logs a failed row, leaking no internal detail', async () => {
    const res = await request(server())
      .post('/api/v1/query/CITIZEN_BASIC')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ params: { fullName: '__FAIL__' } });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/CITIZEN_BASIC_API_KEY|stack|at MockInfoAdapter/);

    const log = await prisma.queryLog.findFirst({
      where: { userId, datasourceCode: 'CITIZEN_BASIC', status: QueryStatus.FAILED, errorCode: 'UPSTREAM_ERROR' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
  });

  it('translates a mock-adapter injected timeout to 504 UPSTREAM_TIMEOUT and logs a failed row', async () => {
    const res = await request(server())
      .post('/api/v1/query/CITIZEN_BASIC')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ params: { fullName: '__SLOW__' } });

    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe('UPSTREAM_TIMEOUT');

    const log = await prisma.queryLog.findFirst({
      where: { userId, datasourceCode: 'CITIZEN_BASIC', status: QueryStatus.FAILED, errorCode: 'UPSTREAM_TIMEOUT' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
  }, 15_000);
});
