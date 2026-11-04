import { join } from 'node:path';
import { DatasourceConfigLoaderService } from './datasource-config.loader';
import { DatasourceRegistryService } from './datasource-registry.service';
import { AdapterFactory } from './adapters/adapter.factory';

const FIXTURES_DIR = join(__dirname, '..', '..', 'test', 'fixtures', 'datasource-configs');
const VALID_MINIMAL_PATH = join(FIXTURES_DIR, 'valid-minimal.json');

function fakeConfigService(env: Record<string, string>): { get: (key: string) => string | undefined } {
  return { get: (key: string) => env[key] };
}

/** Focused unit tests for `DatasourceRegistryService.swap()`/`get()`/`getAll()` in isolation —
 * `config-reload-pipeline.spec.ts` already exercises the full reload pipeline end-to-end (loader +
 * registry + adapter factory together); this file asserts the registry's own contract: a `get()`
 * on an unknown code 404s, a `swap()` is visible on the very next call, and an entry object taken
 * from the registry BEFORE a swap (as an in-flight request would) stays usable afterward even
 * though it's no longer reachable via `get()`. */
describe('DatasourceRegistryService', () => {
  function buildRegistry() {
    const loader = new DatasourceConfigLoaderService(fakeConfigService({ APP_CONFIG_PATH: VALID_MINIMAL_PATH }) as never);
    const factory = new AdapterFactory();
    const registry = new DatasourceRegistryService(loader, factory);
    return { loader, registry, factory };
  }

  it('get() throws (404-shaped NotFoundException) for an unknown code', () => {
    const { registry } = buildRegistry();
    expect(() => registry.get('NOT_A_REAL_CODE')).toThrow(/Unknown datasource/);
  });

  it('getAll() returns the configs for every entry built at construction', () => {
    const { registry } = buildRegistry();
    expect(registry.getAll().map((d) => d.code)).toEqual(['SAMPLE_DS']);
  });

  it('after swap(), get() immediately returns the new entry and the old code is gone', () => {
    const { loader, registry } = buildRegistry();
    const inFlightBeforeSwap = registry.get('SAMPLE_DS');

    const raw = JSON.parse(JSON.stringify(loader.getConfig())) as { datasources: { code: string; permissionCode: string }[] };
    raw.datasources[0]!.code = 'RENAMED_DS';
    raw.datasources[0]!.permissionCode = 'api:renamed_ds';
    const snapshot = loader.buildSnapshot(raw);
    const entries = registry.buildEntries(snapshot);
    loader.applySnapshot(snapshot);
    registry.swap(entries);

    expect(registry.get('RENAMED_DS')).toBeDefined();
    expect(() => registry.get('SAMPLE_DS')).toThrow();

    // The object an in-flight request captured via `get()` BEFORE the swap
    // must still be usable afterward — swapping the live Map must never
    // mutate or invalidate entries already handed out (phase-01 Key Insight:
    // "In-flight requests keep their own {config, adapter} ... swapping is safe").
    expect(inFlightBeforeSwap.config.code).toBe('SAMPLE_DS');
    expect(inFlightBeforeSwap.adapter).toBeDefined();
  });

  it('buildEntries() is pure: it never touches the live entries Map until swap() is called', () => {
    const { loader, registry } = buildRegistry();
    const snapshot = loader.getSnapshot();
    const entries = registry.buildEntries(snapshot);

    expect(entries).not.toBe((registry as unknown as { entries: Map<string, unknown> }).entries);
    // Live registry state is untouched — still resolves the original code.
    expect(registry.get('SAMPLE_DS')).toBeDefined();
  });

  it('swap() returns the OLD map so the caller can retire its adapters', () => {
    const { loader, registry } = buildRegistry();
    const snapshot = loader.getSnapshot();
    const sameEntries = registry.buildEntries(snapshot);

    const old = registry.swap(sameEntries);

    expect(old.size).toBe(1);
    expect(old.get('SAMPLE_DS')).toBeDefined();
  });
});
