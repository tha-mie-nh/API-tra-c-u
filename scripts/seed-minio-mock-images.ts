/**
 * Phase 04 — seeds the local MinIO bucket + `public.citizen_photos` metadata
 * table so the `CITIZEN_PHOTO` datasource (transport.kind="minio-pg") is
 * end-to-end runnable in dev without a real image provider. Idempotent:
 * safe to re-run (uploads overwrite same object keys; DB rows are upserted
 * on the (cccd, object_key) pair).
 *
 * Run via `pnpm --filter api run seed:mock-images` (loads root .env through
 * dotenv-cli, same convention as prisma/seed.ts).
 */
import { Client as MinioClient } from 'minio';
import { Client as PgClient } from 'pg';
import { randomUUID } from 'node:crypto';

// 1x1 red pixel PNG — tiny, valid, enough to prove the storage round-trip
// without shipping a real binary asset into the repo.
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

interface MockPhoto {
  cccd: string;
  source: string;
  capturedAt: string;
}

// Matches the citizens seeded in config/mock-data/citizen-basic.json so a
// CITIZEN_BASIC lookup and a CITIZEN_PHOTO lookup tell the same demo story.
const MOCK_PHOTOS: MockPhoto[] = [
  { cccd: '001099001234', source: 'Chụp tại quầy', capturedAt: '2024-01-10T08:05:00Z' },
  { cccd: '001099001234', source: 'Cập nhật CCCD', capturedAt: '2025-06-20T14:35:00Z' },
  { cccd: '001099001234', source: 'Chụp tại quầy', capturedAt: '2026-03-01T10:05:00Z' },
  { cccd: '001099009999', source: 'Chụp tại quầy', capturedAt: '2023-09-05T09:05:00Z' },
];

async function ensureBucket(minio: MinioClient, bucket: string): Promise<void> {
  const exists = await minio.bucketExists(bucket).catch(() => false);
  if (!exists) {
    await minio.makeBucket(bucket);
    console.log(`Created MinIO bucket "${bucket}"`);
  }
}

async function ensureTable(pg: PgClient): Promise<void> {
  await pg.query(`
    CREATE TABLE IF NOT EXISTS public.citizen_photos (
      id UUID PRIMARY KEY,
      cccd VARCHAR(12) NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL,
      source VARCHAR(255),
      bucket VARCHAR(255) NOT NULL,
      object_key VARCHAR(500) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      UNIQUE (cccd, object_key)
    );
  `);
}

async function seed(): Promise<void> {
  const bucket = process.env.MINIO_BUCKET ?? 'citizen-photos';
  const minio = new MinioClient({
    endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: Number(process.env.MINIO_API_PORT ?? '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? '',
    secretKey: process.env.MINIO_SECRET_KEY ?? '',
  });
  await ensureBucket(minio, bucket);

  const pg = new PgClient({ connectionString: process.env.IMAGE_DB_URL });
  await pg.connect();
  await ensureTable(pg);

  const imageBytes = Buffer.from(SAMPLE_PNG_BASE64, 'base64');

  for (const photo of MOCK_PHOTOS) {
    const objectKey = `citizen/${photo.cccd}/${photo.capturedAt.slice(0, 10)}.png`;
    await minio.putObject(bucket, objectKey, imageBytes, imageBytes.length, { 'Content-Type': 'image/png' });

    await pg.query(
      `INSERT INTO public.citizen_photos (id, cccd, captured_at, source, bucket, object_key, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (cccd, object_key) DO UPDATE SET captured_at = EXCLUDED.captured_at, source = EXCLUDED.source`,
      [randomUUID(), photo.cccd, photo.capturedAt, photo.source, bucket, objectKey, 'image/png'],
    );
    console.log(`Seeded photo ${objectKey}`);
  }

  await pg.end();
  console.log(`Done: ${MOCK_PHOTOS.length} mock photo(s) in bucket "${bucket}" + public.citizen_photos`);
}

seed().catch((err) => {
  console.error('seed-minio-mock-images failed:', err);
  process.exit(1);
});
