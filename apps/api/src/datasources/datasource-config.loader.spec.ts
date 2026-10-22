import { join } from 'node:path';
import { DatasourceConfigLoaderService } from './datasource-config.loader';

const FIXTURES_DIR = join(__dirname, '..', '..', 'test', 'fixtures', 'datasource-configs');
const REPO_CONFIG_PATH = join(__dirname, '..', '..', '..', '..', 'config', 'config.json');

/** Minimal fake `ConfigService` — the loader only ever calls `.get(key)`. */
function fakeConfigService(env: Record<string, string>): { get: (key: string) => string | undefined } {
  return { get: (key: string) => env[key] };
}

describe('DatasourceConfigLoaderService', () => {
  it('loads + freezes a valid config.json', () => {
    const loader = new DatasourceConfigLoaderService(
      fakeConfigService({ APP_CONFIG_PATH: join(FIXTURES_DIR, 'valid-minimal.json') }) as never,
    );
    const config = loader.getConfig();
    expect(config.datasources).toHaveLength(1);
    expect(config.datasources[0]?.code).toBe('SAMPLE_DS');
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('fails fast (throws) on a config missing output.timestampField', () => {
    expect(
      () =>
        new DatasourceConfigLoaderService(
          fakeConfigService({ APP_CONFIG_PATH: join(FIXTURES_DIR, 'missing-timestamp-field.json') }) as never,
        ),
    ).toThrow(/timestampField|schema validation/i);
  });

  it('fails fast on duplicate datasource codes (cross-field check AJV cannot express)', () => {
    expect(
      () =>
        new DatasourceConfigLoaderService(
          fakeConfigService({ APP_CONFIG_PATH: join(FIXTURES_DIR, 'duplicate-codes.json') }) as never,
        ),
    ).toThrow(/duplicate datasource code/i);
  });

  it('fails fast when an enabled datasource references a missing env var', () => {
    expect(
      () =>
        new DatasourceConfigLoaderService(
          fakeConfigService({ APP_CONFIG_PATH: join(FIXTURES_DIR, 'unknown-env-ref.json') }) as never,
        ),
    ).toThrow(/THIS_ENV_VAR_DOES_NOT_EXIST_12345/);
  });

  it('refuses to start with an enabled mock datasource when NODE_ENV=production', () => {
    expect(
      () =>
        new DatasourceConfigLoaderService(
          fakeConfigService({
            APP_CONFIG_PATH: join(FIXTURES_DIR, 'valid-minimal.json'),
            NODE_ENV: 'production',
          }) as never,
        ),
    ).toThrow(/Refusing to start/);
  });

  it('allows mock datasources in production when ALLOW_MOCK_DATASOURCES=true', () => {
    const loader = new DatasourceConfigLoaderService(
      fakeConfigService({
        APP_CONFIG_PATH: join(FIXTURES_DIR, 'valid-minimal.json'),
        NODE_ENV: 'production',
        ALLOW_MOCK_DATASOURCES: 'true',
      }) as never,
    );
    expect(loader.getConfig().datasources).toHaveLength(1);
  });

  /** Regression guard: the real `config/config.json` shipped with the repo must always boot cleanly. */
  it('loads the repo\'s real config/config.json without error', () => {
    const loader = new DatasourceConfigLoaderService(
      fakeConfigService({ APP_CONFIG_PATH: REPO_CONFIG_PATH, ALLOW_MOCK_DATASOURCES: 'true' }) as never,
    );
    const codes = loader.getConfig().datasources.map((d) => d.code);
    expect(codes).toEqual(
      expect.arrayContaining(['IMMIGRATION_HISTORY', 'PASSPORT_INFO', 'DRIVER_LICENSE', 'FACE_PHOTO']),
    );
  });
});
