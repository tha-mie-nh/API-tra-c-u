import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { QueryStatsGranularity, QueryStatsRange } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { COUNTERS } from '../history/query-log-filter/query-log-counters.sql';
import { buildQueryLogWhereSql } from '../history/query-log-filter/query-log-where-sql.builder';

/** Raw aggregate row (snake_case from SQL, already ::int cast — no bigint). */
export interface RawCounterRow {
  requests: number;
  answered: number;
  success: number;
  failed: number;
  denied: number;
  records: number;
  avg_duration_ms: number | null;
  /** SUM/COUNT of non-null duration_ms — lets totals compute an exact average instead of re-averaging rounded averages. */
  duration_sum_ms: number;
  duration_count: number;
}
export interface RawDatasourceRow extends RawCounterRow {
  datasource_code: string;
}
export interface RawBucketRow extends RawCounterRow {
  bucket: string;
}
export interface RawErrorRow {
  error_code: string | null;
  status_code: number | null;
  count: number;
}

/** Whitelisted constants only — NEVER built from user input. */
const BUCKET_SQL: Record<QueryStatsGranularity, { unit: string; fmt: string }> = {
  hour: { unit: 'hour', fmt: 'YYYY-MM-DD"T"HH24' },
  day: { unit: 'day', fmt: 'YYYY-MM-DD' },
  month: { unit: 'month', fmt: 'YYYY-MM' },
};

/** Read-only aggregations over app.query_logs (parametrised, index-friendly UTC range filter). */
@Injectable()
export class QueryStatsSqlRepository {
  constructor(private readonly prisma: PrismaService) {}

  private where(range: Pick<QueryStatsRange, 'from' | 'to'>, code?: string): Prisma.Sql {
    return buildQueryLogWhereSql({ from: new Date(range.from), to: new Date(range.to), datasourceCode: code });
  }

  aggregateByDatasource(range: Pick<QueryStatsRange, 'from' | 'to'>, code?: string): Promise<RawDatasourceRow[]> {
    return this.prisma.$queryRaw<RawDatasourceRow[]>(Prisma.sql`
      SELECT datasource_code, ${COUNTERS}
      FROM app.query_logs
      WHERE ${this.where(range, code)}
      GROUP BY datasource_code
      ORDER BY requests DESC`);
  }

  timeseries(range: QueryStatsRange, code?: string): Promise<RawBucketRow[]> {
    const { unit, fmt } = BUCKET_SQL[range.granularity];
    return this.prisma.$queryRaw<RawBucketRow[]>(Prisma.sql`
      SELECT to_char(date_trunc(${Prisma.raw(`'${unit}'`)}, created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), ${Prisma.raw(`'${fmt}'`)}) AS bucket,
        ${COUNTERS}
      FROM app.query_logs
      WHERE ${this.where(range, code)}
      GROUP BY 1
      ORDER BY 1`);
  }

  topErrors(range: QueryStatsRange, code?: string): Promise<RawErrorRow[]> {
    return this.prisma.$queryRaw<RawErrorRow[]>(Prisma.sql`
      SELECT error_code, status_code, COUNT(*)::int AS count
      FROM app.query_logs
      WHERE ${this.where(range, code)} AND status <> 'success'
      GROUP BY error_code, status_code
      ORDER BY count DESC, error_code ASC NULLS LAST, status_code ASC NULLS LAST
      LIMIT 10`);
  }
}
