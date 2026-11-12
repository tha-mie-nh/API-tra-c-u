import { Module } from '@nestjs/common';
import { DatasourcesModule } from '../datasources/datasources.module';
import { QueryLogService } from './query-log.service';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';
import { HistoryListSqlRepository } from './history-list-sql.repository';
import { HistoryExportCsvService } from './history-export-csv.service';
import { QueryLogRowMapper } from './query-log-row-mapper';

/**
 * Owns `query_logs` reads (`HistoryService`, `GET /history[/:id]`) and the
 * single writer (`QueryLogService`) that `QueryModule` depends on (phase-05
 * Architecture). `PrismaService` comes from the global `PrismaModule`
 * (Phase 02), so it is not re-imported here.
 */
@Module({
  imports: [DatasourcesModule],
  controllers: [HistoryController],
  providers: [QueryLogService, HistoryService, HistoryListSqlRepository, HistoryExportCsvService, QueryLogRowMapper],
  exports: [QueryLogService],
})
export class HistoryModule {}
