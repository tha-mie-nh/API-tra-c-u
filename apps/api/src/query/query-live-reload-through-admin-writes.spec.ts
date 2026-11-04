import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { DatasourceConfigLoaderService } from '../datasources/datasource-config.loader';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import { AdapterFactory } from '../datasources/adapters/adapter.factory';
import { ResponseMapperService } from '../datasources/response-mapper.service';
import type { PermissionSyncService } from '../datasources/permission-sync.service';
import { AdminDatasourcesService } from '../admin-datasources/admin-datasources.service';
import { QueryService } from './query.service';
import { DatasourcePermissionGuard } from './datasource-permission.guard';
import type { PermissionResolverService } from '../rbac/permission-resolver.service';
import type { QueryLogService } from '../history/query-log.service';

/**
 * Phase 05 gap-fill: "live reload provable through the public query path,
 * not just `registry.get()`". The other phases' specs prove the registry
 * updates immediately after an admin write (`config-reload-pipeline.spec.ts`,
 * `admin-datasources.service.spec.ts`) — this spec goes one hop further and
 * exercises the REAL classes that back `POST /query/:code`
 * (`QueryService.execute`, `DatasourcePermissionGuard.canActivate`) against
 * the SAME registry instance an admin write mutated, with no restart and no
 * new instance construction. Kept off the real `config/config.json` and off
 * a full `Test.createTestingModule(AppModule)` boot (the documented
 * `APP_CONFIG_PATH`-from-`.env`-file gotcha) by wiring the production
 * classes directly against a disposable tmp-dir fixture — same safe pattern
 * as `admin-datasources.service.spec.ts`.
 */
function fakeConfigService(env: Record<string, string>): { get: (key: string) => string | undefined } {
  return { get: (key: string) => env[key] };
}

function fakePermissionSync(): PermissionSyncService {
  return { sync: jest.fn().mockResolvedValue(undefined) } as unknown as PermissionSyncService;
}

function fakeQueryLogService(): QueryLogService {
  return { record: jest.fn().mockResolvedValue(undefined), recordDenied: jest.fn().mockResolvedValue(undefined) } as unknown as QueryLogService;
}

function sampleDsEntry(dataFile: string) {
  return {
    code: 'SAMPLE_DS',
    name: 'Sample datasource',
    type: 'info',
    enabled: true,
    transport: { kind: 'mock', dataFile },
    input: { fields: [{ name: 'id', label: 'ID', type: 'string', required: true }] },
    output: {
      timestampField: 'ts',
      sortOrder: 'desc',
      identityField: 'id',
      fields: [
        { name: 'id', label: 'ID', from: 'id', type: 'string' },
        { name: 'ts', label: 'Timestamp', from: 'ts', type: 'datetime' },
        { name: 'value', label: 'Value', from: 'value', type: 'string' },
      ],
    },
  };
}

function fakeExecutionContext(params: { code: string }, user: { id: string; username: string }): ExecutionContext {
  const request = {
    params,
    user,
    requestId: 'req_1',
    ip: '127.0.0.1',
    get: () => undefined,
  };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('live reload through the actual query path (QueryService + DatasourcePermissionGuard)', () => {
  let dir: string;
  let configPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'query-live-reload-'));
    configPath = join(dir, 'config.json');
    await mkdir(join(dir, 'mock-data'), { recursive: true });
    await writeFile(join(dir, 'mock-data', 'v1.json'), JSON.stringify([{ id: 'P1', ts: '2026-01-01T00:00:00Z', value: 'v1' }]), 'utf-8');
    await writeFile(
      configPath,
      JSON.stringify(
        {
          version: 1,
          defaults: { maxResults: 100, pageSize: 20, timeoutMs: 5000, retry: { attempts: 1, backoffMs: 100 } },
          datasources: [{ ...sampleDsEntry('mock-data/v1.json'), permissionCode: 'api:sample_ds' }],
        },
        null,
        2,
      ),
      'utf-8',
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function buildStack() {
    const loader = new DatasourceConfigLoaderService(fakeConfigService({ APP_CONFIG_PATH: configPath }) as never);
    const factory = new AdapterFactory();
    const registry = new DatasourceRegistryService(loader, factory);
    const adminService = new AdminDatasourcesService(loader, registry, factory, fakePermissionSync());
    const queryService = new QueryService(registry, new ResponseMapperService(), fakeQueryLogService());
    const guard = new DatasourcePermissionGuard(
      registry,
      { getEffectivePermissions: async () => new Set(['api:sample_ds']) } as unknown as PermissionResolverService,
      fakeQueryLogService(),
    );
    return { adminService, queryService, guard };
  }

  it('an admin update that swaps the mock dataFile changes POST /query/:code results immediately, with no restart', async () => {
    const { adminService, queryService } = buildStack();
    const user = { id: 'u1', username: 'tester' };

    const before = await queryService.execute({ code: 'SAMPLE_DS', params: { id: 'P1' }, user, requestId: 'r1' });
    expect(before.groups[0]?.records[0]?.value).toBe('v1');

    await writeFile(join(dir, 'mock-data', 'v2.json'), JSON.stringify([{ id: 'P1', ts: '2026-02-01T00:00:00Z', value: 'v2' }]), 'utf-8');
    await adminService.update('SAMPLE_DS', sampleDsEntry('mock-data/v2.json'));

    const after = await queryService.execute({ code: 'SAMPLE_DS', params: { id: 'P1' }, user, requestId: 'r2' });
    expect(after.groups[0]?.records[0]?.value).toBe('v2');
  });

  it('an admin disable makes the SAME guard instance 404 the route; re-enable makes it work again — no restart', async () => {
    const { adminService, guard } = buildStack();
    const ctx = fakeExecutionContext({ code: 'SAMPLE_DS' }, { id: 'u1', username: 'tester' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    await adminService.setEnabled('SAMPLE_DS', false);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotFoundException);

    await adminService.setEnabled('SAMPLE_DS', true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('an admin delete makes the query path 404 via the registry the guard reads from', async () => {
    const { adminService, guard, queryService } = buildStack();
    const ctx = fakeExecutionContext({ code: 'SAMPLE_DS' }, { id: 'u1', username: 'tester' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    await adminService.remove('SAMPLE_DS');

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotFoundException);
    await expect(queryService.execute({ code: 'SAMPLE_DS', params: { id: 'P1' }, user: { id: 'u1', username: 'tester' }, requestId: 'r3' })).rejects.toThrow();
  });
});
