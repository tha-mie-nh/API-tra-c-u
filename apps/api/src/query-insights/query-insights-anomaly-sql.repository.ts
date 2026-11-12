import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QUERY_INSIGHTS_RULES as R } from '@app/shared';
import { NORMALIZED_IP_SQL } from '../common/utils/client-ip.util';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueryLogWhereSql } from '../history/query-log-filter/query-log-where-sql.builder';

export interface RawSpikeRow { user_id: string | null; username: string; day: string; count: number; baseline_avg: number }
export interface RawOffHoursRow {
  user_id: string | null; username: string; off_count: number; total: number; first_at: Date; last_at: Date;
}
export interface RawSharedIdentityRow {
  val: string; field_names: string; datasource_codes: string; distinct_users: number; requests: number;
  users: { userId: string; username: string; count: number }[]; first_at: Date; last_at: Date;
}
export interface RawSharedIpRow { ip: string; distinct_users: number; usernames: string[]; requests: number; last_at: Date }

const SEP = String.fromCharCode(31);
export const ANOMALY_LIST_SEP = SEP;
const OFF_EXPR = buildQueryLogWhereSql({ offHours: true }); // single source of the off-hours predicate
const VN_DAY = (col: Prisma.Sql) => Prisma.sql`date_trunc('day', ${col} AT TIME ZONE 'Asia/Ho_Chi_Minh')`;

/** The 4 anomaly rules. Thresholds from QUERY_INSIGHTS_RULES (numbers, never user input). */
@Injectable()
export class QueryInsightsAnomalySqlRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `where` MUST be built with from = (range from) - baselineDays so the baseline window is complete. */
  spikes(where: Prisma.Sql, rangeFrom: Date): Promise<RawSpikeRow[]> {
    const frame = Prisma.raw(`RANGE BETWEEN INTERVAL '${R.spikeBaselineDays} days' PRECEDING AND INTERVAL '1 day' PRECEDING`);
    return this.prisma.$queryRaw<RawSpikeRow[]>(Prisma.sql`
      WITH daily AS (
        SELECT user_id, MAX(username_snapshot) AS username, ${VN_DAY(Prisma.sql`created_at`)} AS day, COUNT(*)::int AS cnt
        FROM app.query_logs WHERE ${where} GROUP BY user_id, 3
      ), w AS (
        SELECT *, COALESCE(SUM(cnt) OVER (PARTITION BY user_id ORDER BY day ${frame}), 0)::int AS base_sum FROM daily
      )
      SELECT user_id::text AS user_id, username, to_char(day, 'YYYY-MM-DD') AS day, cnt AS count,
        ROUND(base_sum::numeric / ${R.spikeBaselineDays}::int, 2)::float8 AS baseline_avg
      FROM w
      WHERE day >= ${VN_DAY(Prisma.sql`${rangeFrom}::timestamptz`)}
        AND cnt >= ${R.spikeMinCount}::int
        AND cnt * ${R.spikeBaselineDays}::int >= ${R.spikeBaselineMultiplier}::int * base_sum
      ORDER BY cnt DESC, day DESC, user_id ASC NULLS LAST
      LIMIT ${R.maxRowsPerList}`);
  }

  offHours(where: Prisma.Sql): Promise<RawOffHoursRow[]> {
    return this.prisma.$queryRaw<RawOffHoursRow[]>(Prisma.sql`
      SELECT user_id::text AS user_id, MAX(username_snapshot) AS username, COUNT(*)::int AS total,
        (COUNT(*) FILTER (WHERE ${OFF_EXPR}))::int AS off_count,
        MIN(created_at) FILTER (WHERE ${OFF_EXPR}) AS first_at, MAX(created_at) FILTER (WHERE ${OFF_EXPR}) AS last_at
      FROM app.query_logs WHERE ${where}
      GROUP BY user_id
      HAVING COUNT(*) FILTER (WHERE ${OFF_EXPR}) >= 1
      ORDER BY off_count DESC, user_id ASC NULLS LAST
      LIMIT ${R.maxRowsPerList}`);
  }

  /**
   * Same normalised value (upper(trim)) of a sensitive INPUT field used by >= N distinct users.
   * `pairs` = [datasource_code, input field name] from the registry. Values containing '*' (legacy masked rows)
   * and denied attempts are excluded. Raw value is returned to the service which masks it.
   */
  sharedIdentities(where: Prisma.Sql, pairs: { code: string; field: string }[]): Promise<RawSharedIdentityRow[]> {
    if (pairs.length === 0) return Promise.resolve([]);
    const codes = pairs.map((p) => p.code);
    const fields = pairs.map((p) => p.field);
    return this.prisma.$queryRaw<RawSharedIdentityRow[]>(Prisma.sql`
      WITH hits AS (
        SELECT upper(btrim(p.value)) AS val, p.key AS fkey, datasource_code AS ds, user_id, username_snapshot, created_at
        FROM app.query_logs
        CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(query_params) = 'object' THEN query_params ELSE '{}'::jsonb END) AS p(key, value)
        WHERE ${where} AND user_id IS NOT NULL AND status <> 'denied'
          AND btrim(p.value) <> '' AND p.value NOT LIKE '%*%'
          AND (datasource_code, p.key) IN (SELECT * FROM unnest(${codes}::text[], ${fields}::text[]))
      ), per_user AS (
        SELECT val, user_id, MAX(username_snapshot) AS username, COUNT(*)::int AS c, MIN(created_at) AS first_at, MAX(created_at) AS last_at,
          string_agg(DISTINCT fkey, chr(31)) AS fkeys, string_agg(DISTINCT ds, chr(31)) AS dss
        FROM hits GROUP BY val, user_id
      )
      SELECT val, COUNT(*)::int AS distinct_users, SUM(c)::int AS requests,
        string_agg(DISTINCT fkeys, chr(31)) AS field_names, string_agg(DISTINCT dss, chr(31)) AS datasource_codes,
        jsonb_agg(jsonb_build_object('userId', user_id::text, 'username', username, 'count', c) ORDER BY c DESC, username) AS users,
        MIN(first_at) AS first_at, MAX(last_at) AS last_at
      FROM per_user GROUP BY val
      HAVING COUNT(*) >= ${R.sharedIdentityMinUsers}::int
      ORDER BY distinct_users DESC, requests DESC, val ASC
      LIMIT ${R.maxRowsPerList}`);
  }

  sharedIps(where: Prisma.Sql): Promise<RawSharedIpRow[]> {
    return this.prisma.$queryRaw<RawSharedIpRow[]>(Prisma.sql`
      SELECT ${NORMALIZED_IP_SQL} AS ip, COUNT(DISTINCT user_id)::int AS distinct_users,
        (array_agg(DISTINCT username_snapshot))[1:10] AS usernames, COUNT(*)::int AS requests, MAX(created_at) AS last_at
      FROM app.query_logs WHERE ${where} AND ip IS NOT NULL AND user_id IS NOT NULL
      GROUP BY 1
      HAVING COUNT(DISTINCT user_id) >= ${R.sharedIpMinUsers}::int
      ORDER BY distinct_users DESC, requests DESC, 1 ASC
      LIMIT ${R.maxRowsPerList}`);
  }
}
