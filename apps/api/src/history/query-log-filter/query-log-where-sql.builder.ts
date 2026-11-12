import { Prisma } from '@prisma/client';
import { QUERY_INSIGHTS_RULES } from '@app/shared';
import { ipEquivalents } from '../../common/utils/client-ip.util';
import { GAP_SQL } from './query-log-counters.sql';
import type { QueryLogFilter } from './query-log-filter-query.schema';

export interface QueryLogScope {
  /** Set when the caller only has history:view_own. Overrides userId/username/ip filters. */
  forcedUserId?: string;
}

const VN_TS = Prisma.sql`created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'`;
/** Constants from QUERY_INSIGHTS_RULES (numbers), never user input. */
const OFF_HOURS_SQL = Prisma.sql`(EXTRACT(ISODOW FROM ${VN_TS}) IN (6,7) OR EXTRACT(HOUR FROM ${VN_TS}) NOT BETWEEN ${QUERY_INSIGHTS_RULES.workStartHour} AND ${QUERY_INSIGHTS_RULES.workEndHour - 1})`;

/** Escapes LIKE wildcards so user text is matched literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * THE single filter for app.query_logs (Stats, History list/summary/CSV, Insights).
 * Every value is a bound parameter; time range is half-open [from, to).
 * Scope is AND-ed last and strips userId/username/ip from the filter.
 */
export function buildQueryLogWhereSql(f: QueryLogFilter, scope: QueryLogScope = {}): Prisma.Sql {
  const c: Prisma.Sql[] = [];
  const forced = scope.forcedUserId !== undefined;

  if (f.from) c.push(Prisma.sql`created_at >= ${f.from}`);
  if (f.to) c.push(Prisma.sql`created_at < ${f.to}`);
  if (f.datasourceCode) c.push(Prisma.sql`datasource_code = ${f.datasourceCode}`);
  if (f.status?.length) c.push(Prisma.sql`status::text = ANY(${f.status}::text[])`);
  if (f.outcome === 'answered') c.push(Prisma.sql`(status = 'success' AND record_count > 0)`);
  else if (f.outcome === 'empty') c.push(Prisma.sql`(status = 'success' AND COALESCE(record_count, 0) <= 0)`);
  else if (f.outcome === 'gap') c.push(GAP_SQL);

  if (!forced) {
    if (f.userId === null) c.push(Prisma.sql`user_id IS NULL`);
    else if (f.userId !== undefined) c.push(Prisma.sql`user_id = ${f.userId}::uuid`);
    if (f.username) c.push(Prisma.sql`username_snapshot ILIKE ${`%${escapeLike(f.username)}%`} ESCAPE '\\'`);
    if (f.ip) c.push(Prisma.sql`ip = ANY(${ipEquivalents(f.ip)}::inet[])`);
  }

  if (f.statusCode === null) c.push(Prisma.sql`status_code IS NULL`);
  else if (f.statusCode !== undefined) c.push(Prisma.sql`status_code = ${f.statusCode}`);
  if (f.errorCode === null) c.push(Prisma.sql`error_code IS NULL`);
  else if (f.errorCode !== undefined) c.push(Prisma.sql`error_code = ${f.errorCode}`);
  // duration_ms NULL rows never match a duration bound (documented behaviour).
  if (f.durationMinMs !== undefined) c.push(Prisma.sql`duration_ms >= ${f.durationMinMs}`);
  if (f.durationMaxMs !== undefined) c.push(Prisma.sql`duration_ms <= ${f.durationMaxMs}`);
  if (f.hasRecords === true) c.push(Prisma.sql`COALESCE(record_count, 0) > 0`);
  else if (f.hasRecords === false) c.push(Prisma.sql`COALESCE(record_count, 0) <= 0`);
  if (f.upstreamRequestId) c.push(Prisma.sql`upstream_request_id = ${f.upstreamRequestId}`);
  if (f.offHours) c.push(OFF_HOURS_SQL);

  if (forced) c.push(Prisma.sql`user_id = ${scope.forcedUserId}::uuid`);

  return c.length ? Prisma.join(c, ' AND ') : Prisma.sql`TRUE`;
}
