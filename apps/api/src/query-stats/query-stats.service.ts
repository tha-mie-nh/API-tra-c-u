import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import type {
  QueryStatsDatasourceDetailResponse,
  QueryStatsOverviewResponse,
  QueryStatsPreviousPeriod,
  QueryStatsRange,
} from '@app/shared';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import type { QueryStatsQueryDto } from './dto/query-stats-query.dto';
import { QueryStatsSqlRepository } from './query-stats-sql.repository';
import {
  QUERY_STATS_MAX_BUCKETS,
  listBucketKeys,
  resolveQueryStatsRange,
} from './query-stats-date-range.util';
import { resolvePreviousWindow } from './query-stats-previous-range.util';
import {
  fillTimeseries,
  mergeDatasourceRows,
  sumRaw,
  toCounters,
  toErrorItems,
  ZERO_RAW,
} from './query-stats-aggregation.util';

@Injectable()
export class QueryStatsService {
  private readonly logger = new Logger(QueryStatsService.name);

  constructor(
    private readonly repo: QueryStatsSqlRepository,
    private readonly registry: DatasourceRegistryService,
  ) {}

  /** Resolve range and reject granularity/range combos that would produce too many buckets. */
  private resolve(query: QueryStatsQueryDto, now: Date): { range: QueryStatsRange; keys: string[] } {
    const range = resolveQueryStatsRange(query, now);
    const keys = listBucketKeys(range);
    if (keys.length > QUERY_STATS_MAX_BUCKETS) {
      throw new UnprocessableEntityException(
        `granularity '${range.granularity}' yields ${keys.length} buckets (max ${QUERY_STATS_MAX_BUCKETS})`,
      );
    }
    return { range, keys };
  }

  private async previousPeriod(range: QueryStatsRange, now: Date, code?: string): Promise<QueryStatsPreviousPeriod> {
    const prev = resolvePreviousWindow(range, now);
    const rows = await this.repo.aggregateByDatasource(prev, code);
    return { ...prev, totals: toCounters(sumRaw(rows)) };
  }

  async overview(query: QueryStatsQueryDto, now: Date = new Date()): Promise<QueryStatsOverviewResponse> {
    const { range, keys } = this.resolve(query, now);
    try {
      const [perDs, series, errors, previous] = await Promise.all([
        this.repo.aggregateByDatasource(range),
        this.repo.timeseries(range),
        this.repo.topErrors(range),
        this.previousPeriod(range, now),
      ]);
      const configured = this.registry.getAll().map((ds) => ({ code: ds.code, name: ds.name }));
      return {
        range,
        totals: toCounters(sumRaw(perDs)),
        previous,
        byDatasource: mergeDatasourceRows(perDs, configured),
        timeseries: fillTimeseries(series, keys),
        topErrors: toErrorItems(errors),
      };
    } catch (err) {
      this.logger.error(`overview failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async datasourceDetail(
    code: string,
    query: QueryStatsQueryDto,
    now: Date = new Date(),
  ): Promise<QueryStatsDatasourceDetailResponse> {
    const { range, keys } = this.resolve(query, now);
    try {
      const [perDs, series, errors, previous] = await Promise.all([
        this.repo.aggregateByDatasource(range, code),
        this.repo.timeseries(range, code),
        this.repo.topErrors(range, code),
        this.previousPeriod(range, now, code),
      ]);
      const name = this.registry.getAll().find((ds) => ds.code === code)?.name ?? null;
      return {
        range,
        datasource: { code, name },
        totals: toCounters(perDs[0] ?? ZERO_RAW),
        previous,
        timeseries: fillTimeseries(series, keys),
        topErrors: toErrorItems(errors),
      };
    } catch (err) {
      this.logger.error(`datasourceDetail(${code}) failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
