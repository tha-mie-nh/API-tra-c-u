import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { HistorySortField, HistorySummaryResponse } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { COUNTERS, P95_DURATION_SQL } from './query-log-filter/query-log-counters.sql';
import type { QueryLogExportRow, QueryLogRowView } from './query-log-row.types';

/** Whitelisted constants only — NEVER built from user input. */
const SORT_COLUMN: Record<HistorySortField, string> = {
  createdAt: 'created_at',
  durationMs: 'duration_ms',
  recordCount: 'record_count',
};

const ROW_COLUMNS = Prisma.sql`
  id, user_id AS "userId", username_snapshot AS "usernameSnapshot", datasource_code AS "datasourceCode",
  query_params AS "queryParams", query_summary AS "querySummary", status::text AS status,
  status_code AS "statusCode", error_code AS "errorCode", error_message AS "errorMessage",
  record_count AS "recordCount", upstream_request_id AS "upstreamRequestId", duration_ms AS "durationMs",
  host(ip) AS ip, user_agent AS "userAgent", created_at AS "createdAt"`;

interface RawSummaryRow {
  requests: number;
  answered: number;
  success: number;
  failed: number;
  denied: number;
  avg_duration_ms: number | null;
  p95_duration_ms: number | null;
}

export interface ExportCursor {
  createdAtRaw: string;
  id: string;
}

/** Raw-SQL reads of app.query_logs; every WHERE comes from buildQueryLogWhereSql (single filter source). */
@Injectable()
export class HistoryListSqlRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.Sql, sort: HistorySortField, order: 'asc' | 'desc', offset: number, limit: number): Promise<QueryLogRowView[]> {
    const col = Prisma.raw(SORT_COLUMN[sort]);
    const dir = Prisma.raw(order === 'asc' ? 'ASC' : 'DESC');
    // created_at is NOT NULL: spelling out NULLS LAST makes the planner ignore the (created_at DESC) index
    // (Prisma indexes are NULLS FIRST) and sort 100k+ rows (measured 400 ms -> 1 ms on 2M rows without it).
    // duration_ms / record_count are nullable and keep NULLS LAST.
    const nulls = sort === 'createdAt' ? Prisma.empty : Prisma.sql`NULLS LAST`;
    return this.prisma.$queryRaw<QueryLogRowView[]>(Prisma.sql`
      SELECT ${ROW_COLUMNS} FROM app.query_logs WHERE ${where}
      ORDER BY ${col} ${dir} ${nulls}, id DESC
      LIMIT ${limit} OFFSET ${offset}`);
  }

  async count(where: Prisma.Sql): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ n: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS n FROM app.query_logs WHERE ${where}`,
    );
    return row?.n ?? 0;
  }

  async findById(id: string): Promise<QueryLogRowView | null> {
    const rows = await this.prisma.$queryRaw<QueryLogRowView[]>(
      Prisma.sql`SELECT ${ROW_COLUMNS} FROM app.query_logs WHERE id = ${id}::uuid`,
    );
    return rows[0] ?? null;
  }

  async summary(where: Prisma.Sql): Promise<HistorySummaryResponse> {
    const [r] = await this.prisma.$queryRaw<RawSummaryRow[]>(Prisma.sql`
      SELECT ${COUNTERS}, ${P95_DURATION_SQL} AS p95_duration_ms
      FROM app.query_logs WHERE ${where}`);
    const total = r?.requests ?? 0;
    const answered = r?.answered ?? 0;
    const success = r?.success ?? 0;
    return {
      total,
      success,
      failed: r?.failed ?? 0,
      denied: r?.denied ?? 0,
      answered,
      gap: total - answered,
      empty: success - answered,
      successRate: total > 0 ? success / total : null,
      avgDurationMs: r?.avg_duration_ms ?? null,
      p95DurationMs: r?.p95_duration_ms ?? null,
    };
  }

  /** Keyset batch, newest first. Cursor compares the full-precision timestamp text (no µs loss). */
  exportBatch(where: Prisma.Sql, cursor: ExportCursor | null, limit: number): Promise<QueryLogExportRow[]> {
    const after = cursor
      ? Prisma.sql`AND (created_at, id) < (${cursor.createdAtRaw}::timestamptz, ${cursor.id}::uuid)`
      : Prisma.empty;
    return this.prisma.$queryRaw<QueryLogExportRow[]>(Prisma.sql`
      SELECT ${ROW_COLUMNS}, created_at::text AS "createdAtRaw" FROM app.query_logs
      WHERE ${where} ${after}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}`);
  }
}
