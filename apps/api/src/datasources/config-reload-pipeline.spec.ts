import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatasourceConfigLoaderService } from './datasource-config.loader';
import { DatasourceRegistryService } from './datasource-registry.service';
import { AdapterFactory } from './adapters/adapter.factory';
import { MinioPgImageAdapter } from './adapters/minio-pg-image.adapter';

const FIXTURES_DIR = join(__dirname, '..', '..', 'test', 'fixtures', 'datasource-configs');
const VALID_MINIMAL_PATH = join(FIXTURES_DIR, 'valid-minimal.json');

function fakeConfigService(env: Record<string, string>): { get: (key: string) => string | undefined } {
  return { get: (key: string) => env[key] };
}

/** Same shape as the real MINIO-PG datasource type, but never queried — proves `retire()` closes the `pg.Pool` without needing a real Postgres connection (the pool is lazily created on first `execute()`/`getRecordById()`, which this spec never calls). */
function minioPgDatasource(code: string) {
  return {
    code,
    name: `Test ${code}`,
    type: 'image',
    enabled: true,
    permissionCode: `api:${code.toLowerCase()}`,
    transport: {
      kind: 'minio-pg',
      pgUrlEnv: 'TEST_RELOAD_MINIO_PG_URL',
      minio: {
        endpointEnv: 'TEST_RELOAD_MINIO_ENDPOINT',
        accessKeyEnv: 'TEST_RELOAD_MINIO_ACCESS_KEY',
        secretKeyEnv: 'TEST_RELOAD_MINIO_SECRET_KEY',
        bucketEnv: 'TEST_RELOAD_MINIO_BUCKET',
      },
      query: 'SELECT 1',
      recordQuery: 'SELECT 1',
    },
    input: { fields: [{ name: 'id', label: 'ID', type: 'string', required: true }] },
    output: {
      timestampField: 'ts',
      sortOrder: 'desc',
      identityField: 'id',
      fields: [
        { name: 'id', label: 'ID', from: 'id', type: 'string' },
        { name: 'ts', label: 'Timestamp', from: 'ts', type: 'datetime' },
      ],
    },
  };
}

function readValidMinimalRaw(): { datasources: unknown[]; [key: string]: unknown } {
  return JSON.parse(readFileSync(VALID_MINIMAL_PATH, 'utf-8'));
}

describe('reload pipeline (buildSnapshot/applySnapshot + buildEntries/swap + retire)', () => {
  const minioEnvVars = {
    TEST_RELOAD_MINIO_PG_URL: 'postgres://user:pass@localhost:5432/fake',
    TEST_RELOAD_MINIO_ENDPOINT: 'localhost',
    TEST_RELOAD_MINIO_ACCESS_KEY: 'fake-access-key',
    TEST_RELOAD_MINIO_SECRET_KEY: 'fake-secret-key',
    TEST_RELOAD_MINIO_BUCKET: 'fake-bucket',
  };

  beforeEach(() => {
    for (const [key, value] of Object.entries(minioEnvVars)) process.env[key] = value;
  });

  afterEach(() => {
    for (const key of Object.keys(minioEnvVars)) delete process.env[key];
  });

  it('swaps in an added datasource with no restart, then retires it cleanly when removed again', async () => {
    const loader = new DatasourceConfigLoaderService(fakeConfigService({ APP_CONFIG_PATH: VALID_MINIMAL_PATH }) as never);
    const factory = new AdapterFactory();
    const registry = new DatasourceRegistryService(loader, factory);

    expect(registry.getAll().map((d) => d.code)).toEqual(['SAMPLE_DS']);

    // --- Reload #1: add TEST_MINIO_DS ----------------------------------
    const plusMinio = readValidMinimalRaw();
    plusMinio.datasources = [...plusMinio.datasources, minioPgDatasource('TEST_MINIO_DS')];

    const snapshotWithMinio = loader.buildSnapshot(plusMinio);
    const entriesWithMinio = registry.buildEntries(snapshotWithMinio);
    loader.applySnapshot(snapshotWithMinio);
    const entriesBeforeMinio = registry.swap(entriesWithMinio);

    expect(entriesBeforeMinio.size).toBe(1); // only SAMPLE_DS existed pre-swap
    expect(registry.getAll().map((d) => d.code).sort()).toEqual(['SAMPLE_DS', 'TEST_MINIO_DS']);
    expect(loader.getConfig().datasources).toHaveLength(2);
    const minioAdapter = registry.get('TEST_MINIO_DS').adapter as MinioPgImageAdapter;
    expect(minioAdapter).toBeInstanceOf(MinioPgImageAdapter);

    // --- Reload #2: remove TEST_MINIO_DS again -------------------------
    const backToBaseline = readValidMinimalRaw();
    const snapshotBaseline = loader.buildSnapshot(backToBaseline);
    const entriesBaseline = registry.buildEntries(snapshotBaseline);
    loader.applySnapshot(snapshotBaseline);
    const entriesAfterRemoval = registry.swap(entriesBaseline);

    expect(registry.getAll().map((d) => d.code)).toEqual(['SAMPLE_DS']);
    expect(() => registry.get('TEST_MINIO_DS')).toThrow();

    // The retired minio-pg adapter from reload #1 must actually be closed —
    // this is the `pg.Pool` leak case called out in the phase spec.
    const closeSpy = jest.spyOn(minioAdapter, 'close');
    factory.retire([entriesAfterRemoval.get('TEST_MINIO_DS')!.adapter], 0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('buildSnapshot on an invalid candidate throws and never changes the live config', () => {
    const loader = new DatasourceConfigLoaderService(fakeConfigService({ APP_CONFIG_PATH: VALID_MINIMAL_PATH }) as never);
    const before = loader.getConfig();

    const invalid = readValidMinimalRaw();
    invalid.datasources = [...invalid.datasources, invalid.datasources[0]]; // duplicate code

    expect(() => loader.buildSnapshot(invalid)).toThrow(/duplicate datasource code/i);
    expect(loader.getConfig()).toBe(before); // untouched — buildSnapshot never calls applySnapshot itself
  });

  it('rejects a permissionCode that does not match the datasource code derivation', () => {
    const loader = new DatasourceConfigLoaderService(fakeConfigService({ APP_CONFIG_PATH: VALID_MINIMAL_PATH }) as never);
    const invalid = readValidMinimalRaw();
    (invalid.datasources[0] as { permissionCode: string }).permissionCode = 'api:some_other_code';

    expect(() => loader.buildSnapshot(invalid)).toThrow(/does not match the required derivation/i);
  });
});
