import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { DatasourceConfig } from '@app/shared';
import { Public } from '../rbac/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Liveness check. Success criteria (Phase 01): fresh clone + docker compose up
 * + pnpm dev => this endpoint responds on GET /api/v1/health.
 * Also proves the @app/shared workspace package resolves + runs (imports a
 * shared type). NOTE: apps/api deliberately imports via the package name
 * (`@app/shared`, resolved through the pnpm workspace symlink + its built
 * dist/index.d.ts), NOT via the `@shared/*` path alias into
 * packages/shared/src. Reaching into a sibling package's src through a tsc
 * path alias silently expands `rootDir` inference to the repo root, which
 * breaks `nest build`'s output layout (dist/main.js ends up nested under
 * dist/apps/api/src/main.js instead of dist/main.js). apps/api's tsconfig
 * pins `rootDir: "./src"` specifically to fail fast (TS6059) if this
 * alias is ever used here by mistake. apps/web (Vite/esbuild, no tsc emit)
 * is not affected by this and may use `@shared/*` directly.
 */
@Controller('health')
@ApiTags('Health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Phase 03 note: the global JwtAuthGuard/PermissionGuard are fail-closed —
  // every route needs @Public() or @RequirePermission(), including this one
  // (reference-api-specification.md: "GET /health | Public. No internal
  // detail leaked.").
  @Public()
  @Get()
  check(): { status: 'ok'; timestamp: string; sharedTypeCheck: string } {
    // Reference a @shared type at compile time only, to prove cross-package
    // type-checking works end to end (not just that the import statement exists).
    const _typeCheck: DatasourceConfig['type'] = 'info';

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      sharedTypeCheck: _typeCheck,
    };
  }

  // Phase 09: readiness probe (distinct from liveness above) — checks the DB
  // is actually reachable, so Docker/compose `condition: service_healthy`
  // and orchestrators don't route traffic to a container that's up but can't
  // serve real requests yet. Public, no internal detail leaked on failure.
  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ok'; timestamp: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', timestamp: new Date().toISOString() });
    }
  }
}
