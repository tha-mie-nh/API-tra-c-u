import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PermissionKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DatasourceRegistryService } from './datasource-registry.service';

/**
 * Boot-time sync: every `datasources[].permissionCode` is upserted into
 * `permissions` (kind API) — adding a datasource never needs a hand-written
 * migration/insert (phase-04 Key Insight, Success Criteria). Disabled or
 * removed datasources are never deleted (would orphan `role_permissions` and
 * lose audit meaning) — only warned about.
 */
@Injectable()
export class PermissionSyncService implements OnModuleInit {
  private readonly logger = new Logger(PermissionSyncService.name);

  constructor(
    private readonly registry: DatasourceRegistryService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const datasources = this.registry.getAll();

    for (const ds of datasources) {
      await this.prisma.permission.upsert({
        where: { code: ds.permissionCode },
        update: { name: `API: ${ds.name}`, kind: PermissionKind.API },
        create: { code: ds.permissionCode, name: `API: ${ds.name}`, kind: PermissionKind.API },
      });
    }
    this.logger.log(`Synced ${datasources.length} api:* permission(s) from config.json`);

    const currentCodes = new Set(datasources.map((ds) => ds.permissionCode));
    const existingApiPermissions = await this.prisma.permission.findMany({ where: { kind: PermissionKind.API } });
    for (const permission of existingApiPermissions) {
      if (!currentCodes.has(permission.code)) {
        this.logger.warn(
          `Permission "${permission.code}" exists in DB but its datasource is no longer in config.json — kept (never hard-deleted).`,
        );
      }
    }
  }
}
