import { Module } from '@nestjs/common';
import { PermissionResolverService } from './permission-resolver.service';

/**
 * Exports PermissionResolverService for use by PermissionGuard (registered
 * globally in AppModule) and AuthController (GET /auth/me). Guards
 * themselves are registered as APP_GUARD providers in AppModule, not here,
 * to keep "where global behavior is wired" in one obvious place.
 */
@Module({
  providers: [PermissionResolverService],
  exports: [PermissionResolverService],
})
export class RbacModule {}
