import { Module } from '@nestjs/common';
import { DatasourcesModule } from '../datasources/datasources.module';
import { QueryLogService } from './query-log.service';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';

/**
 * Owns `query_logs` reads (`HistoryService`, `GET /history[/:id]`) and the
 * single writer (`QueryLogService`) that `QueryModule` depends on (phase-05
 * Architecture). `PrismaService` comes from the global `PrismaModule`
 * (Phase 02), so it is not re-imported here.
 */
@Module({
  imports: [DatasourcesModule],
  controllers: [HistoryController],
  providers: [QueryLogService, HistoryService],
  exports: [QueryLogService],
})
export class HistoryModule {}
