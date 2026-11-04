import { PermissionKind } from '@prisma/client';
import { PermissionSyncService } from './permission-sync.service';
import type { DatasourceRegistryService } from './datasource-registry.service';
import type { PrismaService } from '../prisma/prisma.service';

function fakeRegistry(codes: string[]): DatasourceRegistryService {
  return {
    getAll: () =>
      codes.map((code) => ({
        code,
        name: code,
        permissionCode: `api:${code.toLowerCase()}`,
      })),
  } as unknown as DatasourceRegistryService;
}

/** Mirrors `health.controller.spec.ts`'s pattern: a plain object of `jest.fn()`s standing in for `PrismaService` — no real DB needed to verify upsert/grant logic. */
function fakePrisma(preExisting: { code: string; kind: PermissionKind }[], adminRoleId: string | null) {
  const permissionsByCode = new Map(preExisting.map((p) => [p.code, { id: `perm_${p.code}`, ...p }]));
  const rolePermissions = new Set<string>();

  return {
    permission: {
      findMany: jest.fn(async ({ where }: { where: { kind?: PermissionKind; code?: { in: string[] } } }) =>
        Array.from(permissionsByCode.values()).filter((p) => {
          if (where.kind !== undefined) return p.kind === where.kind;
          if (where.code) return where.code.in.includes(p.code);
          return true;
        }),
      ),
      upsert: jest.fn(async ({ where, create }: { where: { code: string }; create: { code: string; name: string; kind: PermissionKind } }) => {
        const existing = permissionsByCode.get(where.code);
        if (existing) return existing;
        const created = { id: `perm_${where.code}`, ...create };
        permissionsByCode.set(where.code, created);
        return created;
      }),
      findUnique: jest.fn(async ({ where }: { where: { code: string } }) => permissionsByCode.get(where.code) ?? null),
    },
    role: {
      findUnique: jest.fn(async () => (adminRoleId ? { id: adminRoleId, code: 'ADMIN' } : null)),
    },
    rolePermission: {
      upsert: jest.fn(async ({ create }: { create: { roleId: string; permissionId: string } }) => {
        rolePermissions.add(`${create.roleId}:${create.permissionId}`);
        return create;
      }),
    },
    __rolePermissions: rolePermissions,
    __permissionsByCode: permissionsByCode,
  };
}

describe('PermissionSyncService.sync()', () => {
  it('upserts every datasource permission and grants ONLY the newly-created ones to ADMIN', async () => {
    const prisma = fakePrisma([{ code: 'api:existing_ds', kind: PermissionKind.API }], 'admin-role-id');
    const registry = fakeRegistry(['EXISTING_DS', 'NEW_DS']);
    const service = new PermissionSyncService(registry, prisma as unknown as PrismaService);

    await service.sync();

    expect(prisma.permission.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.__permissionsByCode.has('api:new_ds')).toBe(true);

    // Only the brand-new permission was granted — the pre-existing one (which
    // may have been deliberately revoked from ADMIN) is never re-granted.
    const newPermissionId = prisma.__permissionsByCode.get('api:new_ds')!.id;
    expect(prisma.__rolePermissions.has(`admin-role-id:${newPermissionId}`)).toBe(true);
    expect(prisma.rolePermission.upsert).toHaveBeenCalledTimes(1);
  });

  it('does nothing extra when no datasource is new', async () => {
    const prisma = fakePrisma([{ code: 'api:existing_ds', kind: PermissionKind.API }], 'admin-role-id');
    const registry = fakeRegistry(['EXISTING_DS']);
    const service = new PermissionSyncService(registry, prisma as unknown as PrismaService);

    await service.sync();

    expect(prisma.rolePermission.upsert).not.toHaveBeenCalled();
  });

  it('does not throw when the ADMIN role does not exist (e.g. an isolated test run)', async () => {
    const prisma = fakePrisma([], null);
    const registry = fakeRegistry(['SOME_DS']);
    const service = new PermissionSyncService(registry, prisma as unknown as PrismaService);

    await expect(service.sync()).resolves.toBeUndefined();
    expect(prisma.rolePermission.upsert).not.toHaveBeenCalled();
  });

  it('never deletes a permission row for a datasource removed from config.json (never-delete policy)', async () => {
    const prisma = fakePrisma(
      [{ code: 'api:removed_ds', kind: PermissionKind.API }, { code: 'api:still_here_ds', kind: PermissionKind.API }],
      'admin-role-id',
    );
    // REMOVED_DS was deleted via the admin API — it's no longer in the registry's live config,
    // but its `permissions` row (and any `role_permissions`/`audit_logs` referencing it) must survive.
    const registry = fakeRegistry(['STILL_HERE_DS']);
    const service = new PermissionSyncService(registry, prisma as unknown as PrismaService);
    expect('delete' in prisma.permission).toBe(false); // sanity: the fake never even exposes a delete method

    await service.sync();

    expect(prisma.__permissionsByCode.has('api:removed_ds')).toBe(true);
    expect(prisma.permission.upsert).toHaveBeenCalledTimes(1); // only the still-live datasource is upserted
    expect(prisma.permission.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { code: 'api:still_here_ds' } }));
  });
});
