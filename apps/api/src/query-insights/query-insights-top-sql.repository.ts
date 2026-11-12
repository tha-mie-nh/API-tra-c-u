import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { QueryInsightsTopMetric } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { COUNTERS, GAP_SQL, P95_DURATION_SQL } from '../history/query-log-filter/query-log-counters.sql';
import type { RawCounterRow } from '../query-stats/query-stats-sql.repository';

export interface RawTopUserRow extends RawCounterRow {
  user_id: string | null;
  username: string;
  p95_duration_ms: number | null;
  last_at: Date;
}
export interface RawLatencyRow {
  datasource_code: string;
  requests: number;
  avg_duration_ms: number | null;
  p95_duration_ms: number | null;
  max_duration_ms: number | null;
}
export interface RawErrorCountRow {
  error_code: string | null;
  status_code: number | null;
  count: number;
}

/** Whitelisted SQL constants only — NEVER built from user input (metric is a zod enum). gap reuses GAP_SQL. */
const METRIC_EXPR: Record<QueryInsightsTopMetric, Prisma.Sql> = {
  requests: Prisma.sql`COUNT(*)`,
  failed: Prisma.sql`COUNT(*) FILTER (WHERE status = 'failed')`,
  denied: Prisma.sql`COUNT(*) FILTER (WHERE status = 'denied')`,
  gap: Prisma.sql`COUNT(*) FILTER (WHERE ${GAP_SQL})`,
};

/** Top-N aggregations over app.query_logs. `where` always comes from buildQueryLogWhereSql. */
@Injectable()
export class QueryInsightsTopSqlRepository {
  constructor(private readonly prisma: PrismaService) {}

  topUsers(where: Prisma.Sql, metric: QueryInsightsTopMetric, limit: number): Promise<RawTopUserRow[]> {
    const expr = METRIC_EXPR[metric];
    return this.prisma.$queryRaw<RawTopUserRow[]>(Prisma.sql`
      SELECT user_id::text AS user_id, MAX(username_snapshot) AS username, ${COUNTERS},
        ${P95_DURATION_SQL} AS p95_duration_ms, MAX(created_at) AS last_at
      FROM app.query_logs
      WHERE ${where}
      GROUP BY user_id
      HAVING ${expr} > 0
      ORDER BY ${expr} DESC, COUNT(*) DESC, user_id ASC NULLS LAST
      LIMIT ${limit}`);
  }

  topErrors(where: Prisma.Sql, limit: number): Promise<RawErrorCountRow[]> {
    return this.prisma.$queryRaw<RawErrorCountRow[]>(Prisma.sql`
      SELECT error_code, status_code, COUNT(*)::int AS count
      FROM app.query_logs
      WHERE ${where} AND status <> 'success'
      GROUP BY error_code, status_code
      ORDER BY count DESC, error_code ASC NULLS LAST, status_code ASC NULLS LAST
      LIMIT ${limit}`);
  }

  datasourceLatency(where: Prisma.Sql): Promise<RawLatencyRow[]> {
    return this.prisma.$queryRaw<RawLatencyRow[]>(Prisma.sql`
      SELECT datasource_code, COUNT(*)::int AS requests, ROUND(AVG(duration_ms))::int AS avg_duration_ms,
        ${P95_DURATION_SQL} AS p95_duration_ms, MAX(duration_ms)::int AS max_duration_ms
      FROM app.query_logs
      WHERE ${where}
      GROUP BY datasource_code
      ORDER BY p95_duration_ms DESC NULLS LAST, requests DESC, datasource_code ASC`);
  }
}
