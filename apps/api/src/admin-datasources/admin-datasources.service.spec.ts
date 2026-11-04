import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DatasourceConfigLoaderService } from '../datasources/datasource-config.loader';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import { AdapterFactory } from '../datasources/adapters/adapter.factory';
import type { PermissionSyncService } from '../datasources/permission-sync.service';
import { AdminDatasourcesService } from './admin-datasources.service';

function fakeConfigService(env: Record<string, string>): { get: (key: string) => string | undefined } {
  return { get: (key: string) => env[key] };
}

/** Mirrors `permission-sync.service.spec.ts`'s pattern: a fake standing in
 * for `PermissionSyncService` — the admin service only ever calls
 * `.sync()` (warn-only on failure), never needs a real DB for these tests. */
function fakePermissionSync(): PermissionSyncService {
  return { sync: jest.fn().mockResolvedValue(undefined) } as unknown as PermissionSyncService;
}

const BASELINE_CONFIG = {
  version: 1,
  defaults: { maxResults: 100, pageSize: 20, timeoutMs: 5000, retry: { attempts: 1, backoffMs: 100 } },
  datasources: [
    {
      code: 'SAMPLE_DS',
      name: 'Sample datasource',
      type: 'info',
      enabled: true,
      permissionCode: 'api:sample_ds',
      transport: { kind: 'mock', dataFile: 'mock-data/sample.json' },
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
      limits: { maxResults: 10, pageSize: 5 },
    },
  ],
};

function newMockEntry(code: string) {
  return {
    code,
    name: `New ${code}`,
    type: 'info',
    enabled: true,
    transport: { kind: 'mock', dataFile: `mock-data/${code.toLowerCase()}.json` },
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

describe('AdminDatasourcesService', () => {
  let dir: string;
  let configPath: string;

  async function buildService() {
    const loader = new DatasourceConfigLoaderService(fakeConfigService({ APP_CONFIG_PATH: configPath }) as never);
    const factory = new AdapterFactory();
    const registry = new DatasourceRegistryService(loader, factory);
    const permissionSync = fakePermissionSync();
    const service = new AdminDatasourcesService(loader, registry, factory, permissionSync);
    return { service, loader, registry, factory, permissionSync };
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'admin-datasources-service-'));
    configPath = join(dir, 'config.json');
    await writeFile(configPath, JSON.stringify(BASELINE_CONFIG, null, 2), 'utf-8');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates a datasource: file is written, the registry serves it live with no restart, and permission sync re-runs', async () => {
    const { service, registry, permissionSync } = await buildService();

    const created = await service.create(newMockEntry('NEW_DS'));

    expect(created.code).toBe('NEW_DS');
    expect(created.permissionCode).toBe('api:new_ds'); // server-derived, never trusts a client value
    expect(registry.getAll().map((d) => d.code).sort()).toEqual(['NEW_DS', 'SAMPLE_DS']);
    // Real DB-level upsert/grant correctness is Phase 01's
    // `permission-sync.service.spec.ts`; here we only verify this service
    // actually re-triggers a sync after every write (the wiring, not the
    // DB logic itself).
    expect(permissionSync.sync).toHaveBeenCalledTimes(1);

    const onDisk = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(onDisk.datasources.map((d: { code: string }) => d.code).sort()).toEqual(['NEW_DS', 'SAMPLE_DS']);
  });

  it('rejects a duplicate code with 409 and leaves the file untouched', async () => {
    const { service } = await buildService();
    const before = await stat(configPath);
    const beforeBytes = await readFile(configPath, 'utf-8');

    await expect(service.create(newMockEntry('SAMPLE_DS'))).rejects.toBeInstanceOf(ConflictException);

    expect(await readFile(configPath, 'utf-8')).toBe(beforeBytes);
    expect((await stat(configPath)).mtimeMs).toBe(before.mtimeMs);
  });

  it('rejects an invalid candidate (422) and leaves config.json completely unchanged', async () => {
    const { service, registry } = await buildService();
    const before = await stat(configPath);
    const beforeBytes = await readFile(configPath, 'utf-8');

    // Missing required output.identityField/timestampField -> AJV rejects it.
    const invalid = { ...newMockEntry('BROKEN_DS'), output: { fields: [] } };
    await expect(service.create(invalid)).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(await readFile(configPath, 'utf-8')).toBe(beforeBytes);
    expect((await stat(configPath)).mtimeMs).toBe(before.mtimeMs);
    expect(() => registry.get('BROKEN_DS')).toThrow();
  });

  it('rejects transport.kind "minio-pg" on create, before touching the file', async () => {
    const { service } = await buildService();
    const before = await readFile(configPath, 'utf-8');

    const entry = { ...newMockEntry('IMG_DS'), transport: { kind: 'minio-pg', pgUrlEnv: 'X', minio: {}, query: 'q', recordQuery: 'q' } };
    await expect(service.create(entry)).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(await readFile(configPath, 'utf-8')).toBe(before);
  });

  it('rejects an auth.valueEnv that does not match the *_API_KEY naming policy, before touching the file', async () => {
    const { service } = await buildService();
    const before = await readFile(configPath, 'utf-8');

    const entry = {
      ...newMockEntry('HTTP_DS'),
      transport: {
        kind: 'http',
        baseUrl: 'https://upstream.example.com',
        path: '/find',
        method: 'POST',
        auth: { kind: 'apiKeyHeader', header: 'X-Api-Key', valueEnv: 'JWT_ACCESS_SECRET' },
      },
    };
    await expect(service.create(entry)).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(await readFile(configPath, 'utf-8')).toBe(before);
  });

  it('updates a datasource and the change is live in the registry immediately', async () => {
    const { service, registry } = await buildService();

    const updated = await service.update('SAMPLE_DS', { ...newMockEntry('SAMPLE_DS'), name: 'Renamed sample' });

    expect(updated.name).toBe('Renamed sample');
    expect(registry.get('SAMPLE_DS').config.name).toBe('Renamed sample');
  });

  it('rejects update when the body code differs from the path :code', async () => {
    const { service } = await buildService();
    await expect(service.update('SAMPLE_DS', { ...newMockEntry('SAMPLE_DS'), code: 'OTHER_CODE' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('toggles enabled and the registry reflects it without restart', async () => {
    const { service, registry } = await buildService();

    const disabled = await service.setEnabled('SAMPLE_DS', false);
    expect(disabled.enabled).toBe(false);
    expect(registry.get('SAMPLE_DS').config.enabled).toBe(false);
  });

  it('404s toggling/updating/deleting an unknown code', async () => {
    const { service } = await buildService();
    await expect(service.setEnabled('NOPE', true)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('NOPE')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a datasource: removed from the file and the registry immediately', async () => {
    const { service, registry } = await buildService();

    const result = await service.remove('SAMPLE_DS');

    expect(result).toEqual({ code: 'SAMPLE_DS' });
    expect(() => registry.get('SAMPLE_DS')).toThrow();
    const onDisk = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(onDisk.datasources).toHaveLength(0);
  });

  it('reload-from-disk re-reads a hand edit without ever writing the file', async () => {
    const { service, registry } = await buildService();

    const handEdited = structuredClone(BASELINE_CONFIG);
    // A real hand edit includes `permissionCode` itself (the admin service
    // normally derives it; a human editing the file directly must still
    // supply one that matches `apiPermissionCode`).
    handEdited.datasources.push({ ...newMockEntry('HAND_EDITED_DS'), permissionCode: 'api:hand_edited_ds' } as never);
    await writeFile(configPath, JSON.stringify(handEdited, null, 2), 'utf-8');
    const beforeReload = await readFile(configPath, 'utf-8');

    const list = await service.reloadFromDisk();

    expect(list.map((d) => d.code).sort()).toEqual(['HAND_EDITED_DS', 'SAMPLE_DS']);
    expect(registry.get('HAND_EDITED_DS')).toBeDefined();
    expect(await readFile(configPath, 'utf-8')).toBe(beforeReload); // never written
  });

  it('prod guard: enabling a mock datasource via an admin write under NODE_ENV=production is rejected (422), file unchanged', async () => {
    // Same no-mock-in-production rule the loader enforces at boot
    // (`config-snapshot-builder.ts`) must still hold on a RELOAD triggered
    // by an admin write, not just at process start. Boots from a MOCK-FREE
    // baseline (BASELINE_CONFIG's SAMPLE_DS is itself a mock, so booting
    // THAT file under NODE_ENV=production without the escape hatch would
    // fail at construction, before this test even gets to exercise the
    // admin-write path) — only the NEW datasource being created is a mock.
    const prodConfig = { ...BASELINE_CONFIG, datasources: [] };
    const prodConfigPath = join(dir, 'prod-config.json');
    await writeFile(prodConfigPath, JSON.stringify(prodConfig, null, 2), 'utf-8');

    const prodLoader = new DatasourceConfigLoaderService(
      fakeConfigService({ APP_CONFIG_PATH: prodConfigPath, NODE_ENV: 'production' }) as never,
    );
    const factory = new AdapterFactory();
    const registry = new DatasourceRegistryService(prodLoader, factory);
    const service = new AdminDatasourcesService(prodLoader, registry, factory, fakePermissionSync());
    const before = await readFile(prodConfigPath, 'utf-8');

    await expect(service.create(newMockEntry('PROD_MOCK_DS'))).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(await readFile(prodConfigPath, 'utf-8')).toBe(before);
    expect(() => registry.get('PROD_MOCK_DS')).toThrow();
  });

  it('serializes two concurrent creates so the file never loses an update (no interleaved write)', async () => {
    const { service, registry } = await buildService();

    await Promise.all([service.create(newMockEntry('CONCURRENT_A')), service.create(newMockEntry('CONCURRENT_B'))]);

    const onDisk = JSON.parse(await readFile(configPath, 'utf-8'));
    const codes = onDisk.datasources.map((d: { code: string }) => d.code).sort();
    expect(codes).toEqual(['CONCURRENT_A', 'CONCURRENT_B', 'SAMPLE_DS']);
    expect(registry.getAll().map((d) => d.code).sort()).toEqual(['CONCURRENT_A', 'CONCURRENT_B', 'SAMPLE_DS']);
  });
});
