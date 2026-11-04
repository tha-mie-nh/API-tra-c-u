import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PermissionKind } from '@prisma/client';
import type { DatasourceEntry } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DatasourceRegistryService } from './datasource-registry.service';

const ADMIN_ROLE_CODE = 'ADMIN';

/**
 * Syncs every `datasources[].permissionCode` into `permissions` (kind API) —
 * adding a datasource never needs a hand-written migration/insert (phase-04
 * Key Insight, Success Criteria). Disabled or removed datasources are never
 * deleted (would orphan `role_permissions` and lose audit meaning) — only
 * warned about. Runs once at boot (`onModuleInit`) and again on every
 * reload (`sync()`, called by Phase 02's orchestrator) — resolved Q1:
 * newly-created permission rows are also auto-granted to `ADMIN` on BOTH
 * paths, matching `prisma/seed.ts`'s existing semantics and removing the
 * "re-run seed after adding a datasource" manual step. A previously-revoked
 * permission is never re-granted — only rows that did not exist before this
 * sync call count as "new".
 */
@Injectable()
export class PermissionSyncService implements OnModuleInit {
  private readonly logger = new Logger(PermissionSyncService.name);

  constructor(
    private readonly registry: DatasourceRegistryService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.sync();
  }

  /** Reusable sync body (phase-01 Implementation Step 8). Throws on DB failure — reload's orchestrator (Phase 02) is responsible for catching + logging rather than rethrowing, so a DB hiccup during an admin write never crashes an already-swapped-in config. */
  async sync(): Promise<void> {
    const datasources = this.registry.getAll();

    const preExistingCodes = new Set(
      (await this.prisma.permission.findMany({ where: { kind: PermissionKind.API } })).map((p) => p.code),
    );
    const newCodes = datasources.map((ds) => ds.permissionCode).filter((code) => !preExistingCodes.has(code));

    for (const ds of datasources) {
      await this.prisma.permission.upsert({
        where: { code: ds.permissionCode },
        update: { name: `API: ${ds.name}`, kind: PermissionKind.API },
        create: { code: ds.permissionCode, name: `API: ${ds.name}`, kind: PermissionKind.API },
      });
    }
    this.logger.log(`Synced ${datasources.length} api:* permission(s) from config.json`);

    await this.grantNewPermissionsToAdmin(newCodes);
    this.warnOrphanedPermissions(datasources, await this.prisma.permission.findMany({ where: { kind: PermissionKind.API } }));
  }

  private async grantNewPermissionsToAdmin(newCodes: string[]): Promise<void> {
    if (newCodes.length === 0) return;

    const admin = await this.prisma.role.findUnique({ where: { code: ADMIN_ROLE_CODE } });
    if (!admin) return; // e.g. a unit/e2e test that never seeded the ADMIN role

    const newPermissions = await this.prisma.permission.findMany({ where: { code: { in: newCodes } } });
    for (const permission of newPermissions) {
      await this.prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: admin.id, permissionId: permission.id } },
        update: {},
        create: { roleId: admin.id, permissionId: permission.id },
      });
    }
    this.logger.log(`Auto-granted ${newPermissions.length} new api:* permission(s) to ${ADMIN_ROLE_CODE}`);
  }

  private warnOrphanedPermissions(datasources: DatasourceEntry[], existingApiPermissions: { code: string }[]): void {
    const currentCodes = new Set(datasources.map((ds) => ds.permissionCode));
    for (const permission of existingApiPermissions) {
      if (!currentCodes.has(permission.code)) {
        this.logger.warn(
          `Permission "${permission.code}" exists in DB but its datasource is no longer in config.json — kept (never hard-deleted).`,
        );
      }
    }
  }
}
