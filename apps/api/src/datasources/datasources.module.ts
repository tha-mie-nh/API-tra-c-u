import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { DatasourceConfigLoaderService } from './datasource-config.loader';
import { DatasourceRegistryService } from './datasource-registry.service';
import { AdapterFactory } from './adapters/adapter.factory';
import { ResponseMapperService } from './response-mapper.service';
import { PermissionSyncService } from './permission-sync.service';
import { DatasourcesController } from './datasources.controller';

/**
 * Phase-04 module: config loader, registry, adapters, mapper, boot-time
 * permission sync, and the `GET /datasources` projection endpoint. Exports
 * `DatasourceRegistryService` + `ResponseMapperService` for Phase 05's query
 * module to build `POST /query/:code` on top of, without re-parsing config.
 * Phase 02 additionally exports `AdapterFactory` + `PermissionSyncService` so
 * `AdminDatasourcesModule` can retire old adapters and re-sync permissions
 * after a validated write, reusing these exact instances (never a second
 * copy of the registry's state).
 */
@Module({
  imports: [RbacModule],
  controllers: [DatasourcesController],
  providers: [
    DatasourceConfigLoaderService,
    AdapterFactory,
    DatasourceRegistryService,
    ResponseMapperService,
    PermissionSyncService,
  ],
  exports: [
    DatasourceConfigLoaderService,
    DatasourceRegistryService,
    ResponseMapperService,
    AdapterFactory,
    PermissionSyncService,
  ],
})
export class DatasourcesModule {}
