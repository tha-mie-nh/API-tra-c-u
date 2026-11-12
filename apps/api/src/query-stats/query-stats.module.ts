import { Module } from '@nestjs/common';
import { DatasourcesModule } from '../datasources/datasources.module';
import { QueryStatsController } from './query-stats.controller';
import { QueryStatsService } from './query-stats.service';
import { QueryStatsSqlRepository } from './query-stats-sql.repository';

/** Read-only statistics over app.query_logs. PrismaService is global. */
@Module({
  imports: [DatasourcesModule],
  controllers: [QueryStatsController],
  providers: [QueryStatsService, QueryStatsSqlRepository],
})
export class QueryStatsModule {}
