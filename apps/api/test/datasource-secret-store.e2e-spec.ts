import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DatasourceSecretStore } from '../src/datasource-secrets/datasource-secret-store.service';

/** Postgres thật: key được mã hóa khi ghi, sống qua "khởi động lại" (store mới nạp từ DB), sai khóa chủ thì không giải mã được. */
describe('DatasourceSecretStore on real Postgres (e2e)', () => {
  const code = `E2E_SECRET_DS_${Date.now()}`;
  const plain = 'plain-api-key-for-e2e-0123456789';
  let prisma: PrismaService;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    close = () => app.close();
  });

  afterAll(async () => {
    await prisma.datasourceSecret.deleteMany({ where: { datasourceCode: code } });
    await close();
  });

  it('persists ciphertext only, reloads after a restart, and refuses a different master key', async () => {
    const key = randomBytes(32);
    const first = new DatasourceSecretStore(prisma, key);
    first.stage(code, plain);
    await first.persist(code, 'e2e');

    const row = await prisma.datasourceSecret.findUniqueOrThrow({ where: { datasourceCode: code } });
    expect(row.encryptedValue).not.toContain(plain);
    expect(row.encryptedValue.startsWith('v1.')).toBe(true);

    const restarted = new DatasourceSecretStore(prisma, key);
    await restarted.load();
    expect(restarted.get(code)).toBe(plain);

    const wrongKey = new DatasourceSecretStore(prisma, randomBytes(32));
    await wrongKey.load();
    expect(wrongKey.has(code)).toBe(false);

    restarted.stageRemoval(code);
    await restarted.persist(code, null);
    expect(await prisma.datasourceSecret.findUnique({ where: { datasourceCode: code } })).toBeNull();
  });
});
