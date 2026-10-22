import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { DatasourcesModule } from '../datasources/datasources.module';
import { HistoryModule } from '../history/history.module';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { ImageProxyService } from './image-proxy.service';
import { DatasourcePermissionGuard } from './datasource-permission.guard';
import { QueryThrottlerGuard } from './query-throttler.guard';

/**
 * Wires the datasource engine (Phase 04, via `DatasourcesModule`) to HTTP
 * (phase-05 Architecture): `POST /query/:code` + the image proxy. Depends
 * on `HistoryModule` for `QueryLogService` (the single `query_logs` writer,
 * shared with `DatasourcePermissionGuard`'s denial logging).
 */
@Module({
  imports: [RbacModule, DatasourcesModule, HistoryModule],
  controllers: [QueryController],
  providers: [QueryService, ImageProxyService, DatasourcePermissionGuard, QueryThrottlerGuard],
})
export class QueryModule {}
