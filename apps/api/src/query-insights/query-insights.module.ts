import { Module } from '@nestjs/common';
import { DatasourcesModule } from '../datasources/datasources.module';
import { QueryInsightsController } from './query-insights.controller';
import { QueryInsightsService } from './query-insights.service';
import { QueryInsightsCsvService } from './query-insights-csv.service';
import { QueryInsightsTopSqlRepository } from './query-insights-top-sql.repository';
import { QueryInsightsActivitySqlRepository } from './query-insights-activity-sql.repository';
import { QueryInsightsAnomalySqlRepository } from './query-insights-anomaly-sql.repository';

/** Read-only cross-user analytics over app.query_logs. PrismaService is global. */
@Module({
  imports: [DatasourcesModule],
  controllers: [QueryInsightsController],
  providers: [
    QueryInsightsService, QueryInsightsCsvService, QueryInsightsTopSqlRepository,
    QueryInsightsActivitySqlRepository, QueryInsightsAnomalySqlRepository,
  ],
})
export class QueryInsightsModule {}
