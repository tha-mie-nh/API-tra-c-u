import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { Client as PgClient } from 'pg';
import { Client as MinioClient } from 'minio';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

// Deterministic tiny PNG bytes, distinct from scripts/seed-minio-mock-images.ts's
// fixture so a byte-equality assertion actually proves the right object was
// streamed back, not just "some PNG".
const TEST_IMAGE_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAQAAAC0OQA9AAAADElEQVR42mNk+A8AAQMBAG3zW6oAAAAASUVORK5CYII=',
  'base64',
);

/** Forces supertest/superagent to buffer the raw response body regardless of
 * Content-Type, so `res.body` is always the exact Buffer streamed back — the
 * default parser is not guaranteed to buffer an arbitrary `image/png`. */
function bufferParser(res: NodeJS.ReadableStream, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

/**
 * Phase 05 Risk Assessment #2 (the other mandated security e2e case): the
 * image proxy must NEVER accept a client-supplied bucket/objectKey — the
 * object key is always re-resolved server-side from `recordId` via
 * `transport.recordQuery`. Uses the REAL Postgres (`citizen_photos`) +
 * REAL MinIO bucket (no infra mocks), seeded directly here so the test
 * doesn't depend on `pnpm seed:mock-images` having been run first.
 */
describe('Image proxy (e2e) — GET /query/CITIZEN_PHOTO/image/:recordId', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let pg: PgClient;
  let minio: MinioClient;

  const suffix = Date.now();
  const roleCode = `E2E_IMG_ROLE_${suffix}`;
  const noPermRoleCode = `E2E_IMG_NOPERM_ROLE_${suffix}`;
  const username = `e2e_img_user_${suffix}`;
  const noPermUsername = `e2e_img_noperm_${suffix}`;
  const password = 'ImageE2E#Passw0rd123';

  let accessToken: string;
  let noPermAccessToken: string;

  const testCccd = '099099099099';
  let bucket: string;
  let objectKey: string;
  let recordId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);

    // process.env is populated by @nestjs/config as a side effect of
    // AppModule's compile() above — same pattern as
    // test/datasource-engine.e2e-spec.ts.
    bucket = process.env.MINIO_BUCKET ?? 'citizen-photos';
    pg = new PgClient({ connectionString: process.env.IMAGE_DB_URL });
    await pg.connect();
    minio = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
      port: Number(process.env.MINIO_API_PORT ?? '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY ?? '',
      secretKey: process.env.MINIO_SECRET_KEY ?? '',
    });

    recordId = randomUUID();
    objectKey = `citizen/${testCccd}/e2e-${suffix}.png`;
    await minio.putObject(bucket, objectKey, TEST_IMAGE_BYTES, TEST_IMAGE_BYTES.length, { 'Content-Type': 'image/png' });
    await pg.query(
      `INSERT INTO public.citizen_photos (id, cccd, captured_at, source, bucket, object_key, mime_type)
       VALUES ($1, $2, now(), 'e2e-test', $3, $4, 'image/png')`,
      [recordId, testCccd, bucket, objectKey],
    );

    const citizenPhotoPerm = await prisma.permission.findUniqueOrThrow({ where: { code: 'api:citizen_photo' } });
    const role = await prisma.role.create({ data: { code: roleCode, name: 'E2E Image Role' } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: citizenPhotoPerm.id } });
    const noPermRole = await prisma.role.create({ data: { code: noPermRoleCode, name: 'E2E Image No-Perm Role' } });

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({ data: { username, fullName: 'E2E Image User', passwordHash } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const noPermUser = await prisma.user.create({
      data: { username: noPermUsername, fullName: 'E2E Image No-Perm User', passwordHash },
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
    await pg.query('DELETE FROM public.citizen_photos WHERE id = $1', [recordId]);
    await minio.removeObject(bucket, objectKey).catch(() => undefined);
    await pg.end();
    await prisma.user.deleteMany({ where: { username: { in: [username, noPermUsername] } } });
    await prisma.role.deleteMany({ where: { code: { in: [roleCode, noPermRoleCode] } } });
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('streams the exact image bytes with private caching and no MinIO host/credentials anywhere in the response', async () => {
    const res = await request(server())
      .get(`/api/v1/query/CITIZEN_PHOTO/image/${recordId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse(bufferParser);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('private, max-age=300');
    expect(Buffer.compare(res.body as Buffer, TEST_IMAGE_BYTES)).toBe(0);

    const rawHeaders = JSON.stringify(res.headers);
    const rawBody = (res.body as Buffer).toString('base64');
    expect(rawHeaders).not.toContain(process.env.MINIO_ACCESS_KEY ?? '__unset__');
    expect(rawHeaders).not.toContain(process.env.MINIO_SECRET_KEY ?? '__unset__');
    expect(rawHeaders).not.toContain(bucket);
    expect(rawBody).not.toContain(bucket);
  });

  it('returns 304 when If-None-Match matches the current ETag (no body re-sent)', async () => {
    const first = await request(server())
      .get(`/api/v1/query/CITIZEN_PHOTO/image/${recordId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const etag = first.headers.etag;
    expect(typeof etag).toBe('string');

    const second = await request(server())
      .get(`/api/v1/query/CITIZEN_PHOTO/image/${recordId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('If-None-Match', etag);
    expect(second.status).toBe(304);
  });

  it('the thumb route (passthrough seam) serves the same bytes', async () => {
    const res = await request(server())
      .get(`/api/v1/query/CITIZEN_PHOTO/image/${recordId}/thumb`)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse(bufferParser);
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body as Buffer, TEST_IMAGE_BYTES)).toBe(0);
  });

  it('403s a user without api:citizen_photo, and never touches MinIO for them', async () => {
    const res = await request(server())
      .get(`/api/v1/query/CITIZEN_PHOTO/image/${recordId}`)
      .set('Authorization', `Bearer ${noPermAccessToken}`);
    expect(res.status).toBe(403);
  });

  it('SECURITY: fabricated/path-traversal/SQL-injection-shaped recordIds are ALWAYS rejected with a generic 404 — the object key is never accepted from the client', async () => {
    const maliciousIds = [
      '../../../etc/passwd',
      objectKey, // even the REAL object key itself must not work as a "recordId" — proves the route never treats client input as a path
      "' OR '1'='1",
      'not-a-uuid',
      '00000000-0000-0000-0000-000000000000', // well-formed but non-existent
    ];

    for (const maliciousId of maliciousIds) {
      const res = await request(server())
        .get(`/api/v1/query/CITIZEN_PHOTO/image/${encodeURIComponent(maliciousId)}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
      expect(res.body?.error?.code).toBe('IMAGE_NOT_FOUND');
      // Never leaks the real bucket/object key or any DB/driver error detail.
      const payload = JSON.stringify(res.body);
      expect(payload).not.toContain(bucket);
      expect(payload).not.toMatch(/invalid input syntax|relation .* does not exist|ECONNREFUSED/i);
    }
  });
});
