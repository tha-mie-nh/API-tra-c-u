import { ForbiddenException, Injectable, NotFoundException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import { PermissionResolverService } from '../rbac/permission-resolver.service';
import { QueryLogService } from '../history/query-log.service';

/**
 * Guards every `/query/:code*` route (phase-05 Implementation Step 1 +
 * Key Insight: "the permission it requires is derived from the `:code` path
 * param" — a datasource added purely via config.json is therefore protected
 * automatically, nobody can forget to guard it). Applied via `@UseGuards()`
 * on top of the global `@RequirePermission()` (empty = authenticated-only,
 * same pattern `DatasourcesController` already uses for the same reason:
 * the concrete permission isn't known statically).
 *
 * On denial this ALSO writes a `query_logs` row with `status='denied'`
 * before throwing 403 — a permission rejection is itself security-relevant
 * (Key Insight / Risk Assessment: "Denial events are recorded for security
 * review").
 */
@Injectable()
export class DatasourcePermissionGuard implements CanActivate {
  constructor(
    private readonly registry: DatasourceRegistryService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly queryLogService: QueryLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const code = request.params.code as string;

    // Unknown/disabled datasource -> 404, same as DatasourcesController
    // (registry.get() throws NotFoundException for an unknown code).
    const { config } = this.registry.get(code);
    if (!config.enabled) {
      throw new NotFoundException({ code: 'DATASOURCE_NOT_FOUND', message: `Unknown datasource "${code}"` });
    }

    const user = request.user;
    if (!user?.id) {
      throw new ForbiddenException({ code: 'FORBIDDEN_API', message: 'Access denied' });
    }

    const permissions = await this.permissionResolver.getEffectivePermissions(user.id);
    // Mirror PermissionGuard's caching behavior so handlers can reuse the
    // resolved set without a second DB round trip.
    request.user = { ...user, permissions: Array.from(permissions) };

    if (!permissions.has(config.permissionCode)) {
      await this.queryLogService.recordDenied({
        userId: user.id,
        username: user.username,
        datasourceCode: code,
        requestId: request.requestId,
        ip: request.ip,
        userAgent: request.get('user-agent') ?? undefined,
        // Exactly what the HttpExceptionFilter returns for this ForbiddenException body.
        clientResponse: { error: { code: 'FORBIDDEN_API', message: 'Access denied', requestId: request.requestId } },
      });
      throw new ForbiddenException({ code: 'FORBIDDEN_API', message: 'Access denied' });
    }

    return true;
  }
}
