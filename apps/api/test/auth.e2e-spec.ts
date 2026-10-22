import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Auth flows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = Date.now();
  const username = `e2e_auth_user_${suffix}`;
  const adminUsername = `e2e_auth_admin_${suffix}`;
  const password = 'Initial#Passw0rd123';
  const adminPassword = 'AdminE2E#Passw0rd123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    // Mirrors apps/api/src/main.ts bootstrap() so error envelopes and cookie
    // parsing behave the same as in production.
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({ data: { username, fullName: 'E2E Auth User', passwordHash } });

    // A dedicated test admin (own user, ADMIN role) — NOT the bootstrap
    // "admin" account, so this suite doesn't depend on/mutate real
    // deployment credentials.
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
    const adminHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
    const adminUser = await prisma.user.create({
      data: { username: adminUsername, fullName: 'E2E Auth Admin', passwordHash: adminHash },
    });
    await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: { in: [username, adminUsername] } } });
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('rejects login with a wrong password using a generic error code', async () => {
    const res = await request(server()).post('/api/v1/auth/login').send({ username, password: 'nope-wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects login for an unknown username with the SAME generic error (no enumeration)', async () => {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ username: `does_not_exist_${suffix}`, password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs in successfully, returns an access token and sets the refresh cookie', async () => {
    const res = await request(server()).post('/api/v1/auth/login').send({ username, password });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('auto-locks the account after repeated failed logins', async () => {
    try {
      const maxAttempts = Number(process.env.AUTH_LOGIN_MAX_ATTEMPTS ?? 5);
      for (let i = 0; i < maxAttempts; i++) {
        await request(server()).post('/api/v1/auth/login').send({ username, password: 'still-wrong' });
      }
      const lockedRes = await request(server())
        .post('/api/v1/auth/login')
        .send({ username, password: 'still-wrong' });
      expect(lockedRes.status).toBe(401);
      expect(lockedRes.body.error.code).toBe('ACCOUNT_LOCKED');
    } finally {
      // Reset the auto-lock (even on assertion failure) so later tests in
      // this file can still log in.
      await prisma.user.update({ where: { username }, data: { failedLoginCount: 0, lockedUntil: null } });
    }
  });

  it('rotates the refresh token on use and rejects reuse of the old one', async () => {
    const agent = request.agent(server());
    const loginRes = await agent.post('/api/v1/auth/login').send({ username, password });
    const firstCookie = (loginRes.headers['set-cookie'] as unknown as string[])[0];

    const refreshRes = await agent.post('/api/v1/auth/refresh');
    expect(refreshRes.status).toBe(200);
    const secondCookie = (refreshRes.headers['set-cookie'] as unknown as string[])[0];
    expect(secondCookie.split(';')[0]).not.toBe(firstCookie.split(';')[0]);

    const reuseRes = await request(server()).post('/api/v1/auth/refresh').set('Cookie', firstCookie);
    expect(reuseRes.status).toBe(401);
  });

  it('logout revokes the refresh token so a subsequent refresh fails', async () => {
    const agent = request.agent(server());
    const loginRes = await agent.post('/api/v1/auth/login').send({ username, password });
    // Logout is authenticated-only (@RequirePermission()) — needs the
    // in-memory access token, which (unlike the refresh cookie) supertest's
    // agent does not resend automatically.
    const logoutRes = await agent
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await agent.post('/api/v1/auth/refresh');
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('admin lock propagates: locked user refresh fails on next use, and an audit row is written', async () => {
    const agent = request.agent(server());
    const loginRes = await agent.post('/api/v1/auth/login').send({ username, password });
    expect(loginRes.status).toBe(200);

    const adminLoginRes = await request(server())
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: adminPassword });
    expect(adminLoginRes.status).toBe(200);
    const adminToken = adminLoginRes.body.accessToken;

    const targetUser = await prisma.user.findUniqueOrThrow({ where: { username } });
    const lockRes = await request(server())
      .post(`/api/v1/admin/users/${targetUser.id}/lock`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(lockRes.status).toBe(200);

    const refreshAfterLock = await agent.post('/api/v1/auth/refresh');
    expect(refreshAfterLock.status).toBe(401);

    const auditRows = await prisma.auditLog.findMany({
      where: { action: 'user.lock', targetId: targetUser.id },
    });
    expect(auditRows.length).toBeGreaterThan(0);
    // Never persist a hash/token/temp-password, even inside a JSON diff blob.
    expect(JSON.stringify(auditRows)).not.toMatch(/\$argon2/);
  });
});
