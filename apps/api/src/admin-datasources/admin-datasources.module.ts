import { Module } from '@nestjs/common';
import { DatasourcesModule } from '../datasources/datasources.module';
import { AdminDatasourcesController } from './admin-datasources.controller';
import { AdminDatasourcesService } from './admin-datasources.service';

/** Phase 02: ADMIN-only `config.json` CRUD + live reload. Depends on
 * `DatasourcesModule`'s exported loader/registry/adapterFactory/
 * permissionSync — the exact live instances every other request reads, so
 * a validated write is visible with no restart. */
@Module({
  imports: [DatasourcesModule],
  controllers: [AdminDatasourcesController],
  providers: [AdminDatasourcesService],
})
export class AdminDatasourcesModule {}
