import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

// Deliberately has NEITHER @Public() NOR @RequirePermission() — proves the
// fail-closed invariant from phase-03 Risk Assessment: "A new route
// silently ships without a permission check" must be impossible, not just
// discouraged.
@Controller('__test_undecorated__')
class UndecoratedTestController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Module({ controllers: [UndecoratedTestController] })
class UndecoratedTestModule {}

describe('RBAC guards (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = Date.now();
  const username = `e2e_rbac_noperm_${suffix}`;
  const password = 'RbacTest#Passw0rd123';
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, UndecoratedTestModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({ data: { username, fullName: 'E2E RBAC No-Perm User', passwordHash } });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password });
    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username } });
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('denies (403) a route with no @Public()/@RequirePermission() metadata, even when authenticated', async () => {
    const res = await request(server())
      .get('/api/v1/__test_undecorated__')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_API');
  });

  it('denies (401) the same undecorated route with no token (auth runs before authorization)', async () => {
    const res = await request(server()).get('/api/v1/__test_undecorated__');
    expect(res.status).toBe(401);
  });

  it('allows a @Public() route without a token', async () => {
    const res = await request(server()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects an authenticated-only route (empty @RequirePermission()) without a token', async () => {
    const res = await request(server()).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('allows an authenticated-only route with a valid token and no specific permission granted', async () => {
    const res = await request(server()).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.permissions).toEqual([]);
  });

  it('denies (403) an admin route for an authenticated user lacking admin:users', async () => {
    const res = await request(server())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_API');
  });
});
