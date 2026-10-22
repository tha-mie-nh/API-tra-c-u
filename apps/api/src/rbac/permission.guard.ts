import {
  ForbiddenException,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSIONS_KEY } from './permission.decorator';
import { PermissionResolverService } from './permission-resolver.service';

/**
 * Global authorization guard (registered after JwtAuthGuard). Fail-closed:
 * a non-@Public() route with NO @RequirePermission() metadata is DENIED
 * (403), not silently allowed — this is the single most important invariant
 * of the whole API (spec g: "Backend kiểm tra authentication và permission
 * cho mọi request"). See phase-03 Risk Assessment.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();

    if (required === undefined) {
      this.logger.warn(
        `Denied ${request.method} ${request.originalUrl}: no @Public()/@RequirePermission() metadata (fail-closed)`,
      );
      throw new ForbiddenException({ code: 'FORBIDDEN_API', message: 'Access denied' });
    }

    if (required.length === 0) {
      return true; // authenticated-only route, no specific permission required
    }

    const user = request.user;
    if (!user?.id) {
      throw new ForbiddenException({ code: 'FORBIDDEN_API', message: 'Access denied' });
    }

    const permissions = await this.permissionResolver.getEffectivePermissions(user.id);
    // Cache the resolved set on the request only, so handlers (e.g. GET
    // /auth/me) can reuse it without a second DB round trip. Never cached
    // across requests — see PermissionResolverService.
    request.user = { ...user, permissions: Array.from(permissions) };

    const allowed = required.some((code) => permissions.has(code));
    if (!allowed) {
      this.logger.warn(
        `Denied ${request.method} ${request.originalUrl} for user ${user.id}: missing one of [${required.join(', ')}]`,
      );
      throw new ForbiddenException({ code: 'FORBIDDEN_API', message: 'Access denied' });
    }
    return true;
  }
}
