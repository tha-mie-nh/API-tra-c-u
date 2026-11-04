import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PermissionKind } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

const REAL_CONFIG_PATH = join(__dirname, '..', '..', '..', 'config', 'config.json');

async function sha256Of(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

/**
 * RBAC-only e2e check for `/admin/datasources` (phase-02). Deliberately
 * GET-only and runs against the REAL `config/config.json` — `AppConfigModule`
 * bakes `ConfigModule.forRoot()` in at class-definition time (confirmed by
 * `datasource-engine.e2e-spec.ts`'s own comment: it cannot be re-pointed at
 * a fixture per test run), so a full-`AppModule` e2e boot always loads the
 * real file. Mutation + "live reload with no restart" coverage (create/
 * update/toggle/delete/reload-from-disk, minio-pg + env-naming rejection,
 * concurrent-write serialization, file-untouched-on-422) lives in
 * `admin-datasources.service.spec.ts` instead, which wires the exact same
 * production classes (`DatasourceConfigLoaderService`/`DatasourceRegistryService`/
 * `AdapterFactory`/`AdminDatasourcesService`) against a disposable fixture
 * file, with zero risk to the real config.json.
 */
describe('admin datasources RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = Date.now();
  const adminUsername = `e2e_admin_ds_rbac_${suffix}`;
  const plainUsername = `e2e_plain_ds_rbac_${suffix}`;
  const roleCode = `E2E_ADMIN_DS_RBAC_ROLE_${suffix}`;
  const password = 'AdminDsRbacTest#Passw0rd123';
  let adminToken: string;
  let plainToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);

    const permission = await prisma.permission.upsert({
      where: { code: 'admin:datasources' },
      update: {},
      create: { code: 'admin:datasources', name: 'Manage datasources', kind: PermissionKind.FEATURE },
    });
    const role = await prisma.role.create({ data: { code: roleCode, name: 'E2E admin-datasources RBAC role' } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const adminUser = await prisma.user.create({
      data: { username: adminUsername, fullName: 'E2E Admin DS RBAC', passwordHash },
    });
    await prisma.userRole.create({ data: { userId: adminUser.id, roleId: role.id } });
    await prisma.user.create({ data: { username: plainUsername, fullName: 'E2E Plain', passwordHash } });

    const adminLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: adminUsername, password });
    adminToken = adminLogin.body.accessToken;
    const plainLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: plainUsername, password });
    plainToken = plainLogin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: { in: [adminUsername, plainUsername] } } });
    await prisma.role.deleteMany({ where: { code: roleCode } });
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('denies (403) every route for a user without admin:datasources', async () => {
    // The global `PermissionGuard` is fail-closed and runs BEFORE any
    // controller/pipe logic, so a dummy/garbage body on the mutating routes
    // below never reaches validation or `config.json` — safe to probe all 8
    // routes (phase-05 matrix: "RBAC 403 for every admin-datasources route,
    // not just a subset") against the real app without any mutation risk.
    const authHeader = { Authorization: `Bearer ${plainToken}` } as const;

    const list = await request(server()).get('/api/v1/admin/datasources').set(authHeader);
    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('FORBIDDEN_API');

    const envRefs = await request(server()).get('/api/v1/admin/datasources/env-refs').set(authHeader);
    expect(envRefs.status).toBe(403);

    const getOne = await request(server()).get('/api/v1/admin/datasources/SOME_CODE').set(authHeader);
    expect(getOne.status).toBe(403);

    const create = await request(server()).post('/api/v1/admin/datasources').set(authHeader).send({ code: 'NOPE' });
    expect(create.status).toBe(403);

    const update = await request(server()).put('/api/v1/admin/datasources/SOME_CODE').set(authHeader).send({ code: 'NOPE' });
    expect(update.status).toBe(403);

    const toggle = await request(server()).patch('/api/v1/admin/datasources/SOME_CODE/enabled').set(authHeader).send({ enabled: true });
    expect(toggle.status).toBe(403);

    const remove = await request(server()).delete('/api/v1/admin/datasources/SOME_CODE').set(authHeader);
    expect(remove.status).toBe(403);

    const reload = await request(server()).post('/api/v1/admin/datasources/reload').set(authHeader);
    expect(reload.status).toBe(403);
  });

  it('denies (401) with no token at all, for every route', async () => {
    expect((await request(server()).get('/api/v1/admin/datasources')).status).toBe(401);
    expect((await request(server()).get('/api/v1/admin/datasources/env-refs')).status).toBe(401);
    expect((await request(server()).get('/api/v1/admin/datasources/SOME_CODE')).status).toBe(401);
    expect((await request(server()).post('/api/v1/admin/datasources').send({})).status).toBe(401);
    expect((await request(server()).put('/api/v1/admin/datasources/SOME_CODE').send({})).status).toBe(401);
    expect((await request(server()).patch('/api/v1/admin/datasources/SOME_CODE/enabled').send({})).status).toBe(401);
    expect((await request(server()).delete('/api/v1/admin/datasources/SOME_CODE')).status).toBe(401);
    expect((await request(server()).post('/api/v1/admin/datasources/reload')).status).toBe(401);
  });

  it('allows a granted admin to list the real config.json datasources', async () => {
    const res = await request(server()).get('/api/v1/admin/datasources').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('envStatus');
  });

  it('rejects an invalid create (missing required fields) with 422 and leaves config.json byte-for-byte + mtime unchanged', async () => {
    const before = await stat(REAL_CONFIG_PATH);
    const beforeHash = await sha256Of(REAL_CONFIG_PATH);

    const res = await request(server())
      .post('/api/v1/admin/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'E2E_INVALID_DS', name: 'Invalid', type: 'info', enabled: true, transport: { kind: 'mock' } });

    expect(res.status).toBe(422);

    expect(await sha256Of(REAL_CONFIG_PATH)).toBe(beforeHash);
    expect((await stat(REAL_CONFIG_PATH)).mtimeMs).toBe(before.mtimeMs);
  });

  it('rejects minio-pg transport.kind and a non-policy-compliant env var name with 422, file untouched', async () => {
    const beforeHash = await sha256Of(REAL_CONFIG_PATH);

    const minioRes = await request(server())
      .post('/api/v1/admin/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'E2E_MINIO_DS',
        name: 'Minio',
        type: 'image',
        enabled: false,
        transport: { kind: 'minio-pg', pgUrlEnv: 'X', minio: { endpointEnv: 'A', accessKeyEnv: 'B', secretKeyEnv: 'C', bucketEnv: 'D' }, query: 'q', recordQuery: 'q' },
        input: { fields: [{ name: 'id', label: 'ID', type: 'string', required: true }] },
        output: { timestampField: 'ts', sortOrder: 'desc', identityField: 'id', fields: [{ name: 'id', label: 'ID', from: 'id', type: 'string' }, { name: 'ts', label: 'Ts', from: 'ts', type: 'datetime' }] },
      });
    expect(minioRes.status).toBe(422);

    const badEnvRes = await request(server())
      .post('/api/v1/admin/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'E2E_BAD_ENV_DS',
        name: 'Bad env',
        type: 'info',
        enabled: false,
        transport: { kind: 'http', baseUrl: 'https://upstream.example.com', path: '/find', method: 'POST', auth: { kind: 'apiKeyHeader', header: 'X-Api-Key', valueEnv: 'JWT_ACCESS_SECRET' } },
        input: { fields: [{ name: 'id', label: 'ID', type: 'string', required: true }] },
        output: { timestampField: 'ts', sortOrder: 'desc', identityField: 'id', fields: [{ name: 'id', label: 'ID', from: 'id', type: 'string' }, { name: 'ts', label: 'Ts', from: 'ts', type: 'datetime' }] },
      });
    expect(badEnvRes.status).toBe(422);

    expect(await sha256Of(REAL_CONFIG_PATH)).toBe(beforeHash);
  });

  it('returns env var NAMES only (never values) from /env-refs for a granted admin', async () => {
    process.env.E2E_RBAC_PROBE_API_KEY = 'super-secret-value';
    const res = await request(server()).get('/api/v1/admin/datasources/env-refs').set('Authorization', `Bearer ${adminToken}`);
    delete process.env.E2E_RBAC_PROBE_API_KEY;

    expect(res.status).toBe(200);
    expect(res.body.apiKeyEnvNames).toContain('E2E_RBAC_PROBE_API_KEY');
    expect(JSON.stringify(res.body)).not.toContain('super-secret-value');
  });
});
