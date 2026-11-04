import { join } from 'node:path';
import * as argon2 from 'argon2';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppConfigModule } from '../src/config/app-config.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PermissionResolverService } from '../src/rbac/permission-resolver.service';
import { DatasourceConfigLoaderService } from '../src/datasources/datasource-config.loader';
import { AdapterFactory } from '../src/datasources/adapters/adapter.factory';
import { DatasourceRegistryService } from '../src/datasources/datasource-registry.service';
import { PermissionSyncService } from '../src/datasources/permission-sync.service';
import { ResponseMapperService } from '../src/datasources/response-mapper.service';
import { DatasourcesController } from '../src/datasources/datasources.controller';
import type { JwtUser } from '../src/rbac/jwt-user.interface';

const FIXTURES_DIR = join(__dirname, 'fixtures', 'fourth-datasource-acceptance');
const BASELINE_CONFIG = join(FIXTURES_DIR, 'baseline-config.json');
const PLUS_FOURTH_CONFIG = join(FIXTURES_DIR, 'plus-fourth-config.json');

/** Minimal fake `ConfigService` — the loader only ever calls `.get(key)`. Lets each test
 * instance point at its own config.json without touching the process-wide, load-once
 * `@nestjs/config` module (its `ConfigModule.forRoot()` call is baked in at
 * app-config.module.ts's *class definition time*, so it cannot be re-pointed per test —
 * this is why the acceptance test below wires the datasource engine directly instead of
 * rebooting a second full AppModule/HTTP server). */
function fakeConfigService(env: Record<string, string>): { get: (key: string) => string | undefined } {
  return { get: (key: string) => env[key] };
}

function buildRegistry(configPath: string): DatasourceRegistryService {
  const loader = new DatasourceConfigLoaderService(fakeConfigService({ APP_CONFIG_PATH: configPath }) as never);
  const factory = new AdapterFactory();
  return new DatasourceRegistryService(loader, factory);
}

/**
 * Phase-04 "real acceptance test of the architecture" (phase-04.md
 * Implementation Step 14 / Success Criteria): adding a 4th datasource to
 * config.json + restarting must make it queryable and permission-assignable
 * with ZERO code change and ZERO migration. Never touches the real
 * config/config.json — everything reads from fixtures. Uses the exact same
 * production classes (DatasourceConfigLoaderService, AdapterFactory,
 * DatasourceRegistryService, PermissionSyncService, ResponseMapperService,
 * DatasourcesController) that back the real `GET /datasources` route.
 */
describe('datasource engine — add a 4th datasource via config only (e2e)', () => {
  let prisma: PrismaService;
  let permissionResolver: PermissionResolverService;

  const suffix = Date.now();
  const username = `e2e_ds4_${suffix}`;
  const roleCode = `E2E_DS4_ROLE_${suffix}`;
  const password = 'Ds4Test#Passw0rd123';

  beforeAll(async () => {
    // AppConfigModule loads the root .env into process.env (DATABASE_URL etc.) —
    // needed since this test never boots the full AppModule.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule],
    }).compile();
    prisma = moduleFixture.get(PrismaService);
    permissionResolver = new PermissionResolverService(prisma);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username } });
    await prisma.role.deleteMany({ where: { code: roleCode } });
    await prisma.permission.deleteMany({ where: { code: { startsWith: 'api:e2e_ds_' } } });
    await prisma.$disconnect();
  });

  it('boots with exactly the 3 baseline datasources', () => {
    const registry = buildRegistry(BASELINE_CONFIG);
    const codes = registry.getAll().map((ds) => ds.code);
    expect(codes.sort()).toEqual(['E2E_DS_ONE', 'E2E_DS_THREE', 'E2E_DS_TWO']);
    expect(() => registry.get('E2E_DS_FOUR')).toThrow();
  });

  it('after appending a 4th datasource + "restart" (fresh registry build), it is immediately queryable and permission-assignable — no code change, no migration', async () => {
    const registry = buildRegistry(PLUS_FOURTH_CONFIG);

    // 1) Registry sees all 4, including the brand-new one.
    const codes = registry.getAll().map((ds) => ds.code);
    expect(codes.sort()).toEqual(['E2E_DS_FOUR', 'E2E_DS_ONE', 'E2E_DS_THREE', 'E2E_DS_TWO']);

    // 2) PermissionSyncService (real OnModuleInit logic) auto-creates its
    // permission row — no hand-written migration/insert.
    await new PermissionSyncService(registry, prisma).onModuleInit();
    const permission = await prisma.permission.findUnique({ where: { code: 'api:e2e_ds_four' } });
    expect(permission).not.toBeNull();
    expect(permission?.kind).toBe('API');

    // 3) It is genuinely queryable end-to-end through the SAME (unmodified)
    // MockInfoAdapter + ResponseMapperService classes every other mock
    // datasource uses — only config + a fixture data file were added.
    const entry = registry.get('E2E_DS_FOUR');
    const validated = entry.inputSchema.parse({ id: 'X4' });
    const result = await entry.adapter.execute({ params: validated });
    expect(result.records).toHaveLength(2);
    const mapper = new ResponseMapperService();
    const envelope = mapper.map(result.records, entry.config, { requestId: 'acceptance-test', tookMs: 1 });
    expect(envelope.groups).toHaveLength(1);
    expect(envelope.groups[0]?.identity).toBe('X4');
    expect(envelope.groups[0]?.records).toHaveLength(2);

    // 4) It is permission-assignable and the real DatasourcesController (the
    // exact class GET /datasources routes to) returns it once granted, and
    // ONLY it — proving "ẩn chức năng nếu không có quyền" for a datasource
    // that did not exist when the server started.
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({ data: { username, fullName: 'E2E DS4 User', passwordHash } });
    const role = await prisma.role.create({ data: { code: roleCode, name: 'E2E DS4 role' } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission!.id } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

    const controller = new DatasourcesController(registry, permissionResolver);
    const jwtUser: JwtUser = { id: user.id, username: user.username };
    const listed = await controller.list(jwtUser);
    expect(listed.map((d) => d.code)).toEqual(['E2E_DS_FOUR']);

    const single = await controller.getOne(jwtUser, 'E2E_DS_FOUR');
    expect(single.code).toBe('E2E_DS_FOUR');
    await expect(controller.getOne(jwtUser, 'E2E_DS_ONE')).rejects.toMatchObject({ status: 403 });
  });
});
