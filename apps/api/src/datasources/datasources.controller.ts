import { Controller, ForbiddenException, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ClientDatasource } from '@app/shared';
import { RequirePermission } from '../rbac/permission.decorator';
import { CurrentUser } from '../rbac/current-user.decorator';
import type { JwtUser } from '../rbac/jwt-user.interface';
import { PermissionResolverService } from '../rbac/permission-resolver.service';
import { DatasourceRegistryService } from './datasource-registry.service';

/**
 * `GET /datasources[/:code]` — config projection, filtered by the caller's
 * effective permissions (reference-api-specification.md). This is how "user
 * không có quyền API thì chức năng ẩn trên Frontend" is implemented: the FE
 * renders exactly what it receives, no client-side permission table.
 *
 * Both routes use `@RequirePermission()` (empty = authenticated only)
 * because the actual required permission is dynamic (per-datasource) — the
 * single static-permission enforcement point (PermissionGuard) cannot know
 * it ahead of time, so the check happens explicitly in the handler, exactly
 * as reference-api-specification.md's "Permission enforcement rule" section
 * describes for `:code`-derived permissions.
 */
@Controller('datasources')
@ApiTags('Datasources')
@ApiBearerAuth('access-token')
export class DatasourcesController {
  constructor(
    private readonly registry: DatasourceRegistryService,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  @RequirePermission()
  @Get()
  async list(@CurrentUser() user: JwtUser): Promise<ClientDatasource[]> {
    const permissions = await this.permissionResolver.getEffectivePermissions(user.id);
    return this.registry.getForUser(permissions).map((ds) => this.registry.toClientProjection(ds));
  }

  @RequirePermission()
  @Get(':code')
  async getOne(@CurrentUser() user: JwtUser, @Param('code') code: string): Promise<ClientDatasource> {
    const { config } = this.registry.get(code);
    const permissions = await this.permissionResolver.getEffectivePermissions(user.id);
    if (!config.enabled || !permissions.has(config.permissionCode)) {
      throw new ForbiddenException({ code: 'FORBIDDEN_API', message: 'Access denied' });
    }
    return this.registry.toClientProjection(config);
  }
}
