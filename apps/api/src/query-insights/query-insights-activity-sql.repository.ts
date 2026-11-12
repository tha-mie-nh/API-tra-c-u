import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NORMALIZED_IP_SQL } from '../common/utils/client-ip.util';
import { COUNTERS } from '../history/query-log-filter/query-log-counters.sql';
import type { RawCounterRow } from '../query-stats/query-stats-sql.repository';

export interface RawSpan { first_at: Date | null; last_at: Date | null }
export interface RawDatasourceCount { datasource_code: string; count: number }
export interface RawIpUsage { ip: string; count: number; first_at: Date; last_at: Date }
export interface RawUserAgentUsage { user_agent: string; count: number; last_at: Date }
export interface RawIpUserUsage { user_id: string | null; username: string; count: number; first_at: Date; last_at: Date }

const LIST_LIMIT = 100;

/** Per-user / per-IP drill-down aggregates. `where` always comes from buildQueryLogWhereSql. */
@Injectable()
export class QueryInsightsActivitySqlRepository {
  constructor(private readonly prisma: PrismaService) {}

  async totals(where: Prisma.Sql): Promise<RawCounterRow> {
    const rows = await this.prisma.$queryRaw<RawCounterRow[]>(
      Prisma.sql`SELECT ${COUNTERS} FROM app.query_logs WHERE ${where}`,
    );
    return rows[0]!;
  }

  async span(where: Prisma.Sql): Promise<RawSpan> {
    const rows = await this.prisma.$queryRaw<RawSpan[]>(
      Prisma.sql`SELECT MIN(created_at) AS first_at, MAX(created_at) AS last_at FROM app.query_logs WHERE ${where}`,
    );
    return rows[0]!;
  }

  byDatasource(where: Prisma.Sql): Promise<RawDatasourceCount[]> {
    return this.prisma.$queryRaw<RawDatasourceCount[]>(Prisma.sql`
      SELECT datasource_code, COUNT(*)::int AS count FROM app.query_logs WHERE ${where}
      GROUP BY datasource_code ORDER BY count DESC, datasource_code ASC`);
  }

  ips(where: Prisma.Sql): Promise<RawIpUsage[]> {
    return this.prisma.$queryRaw<RawIpUsage[]>(Prisma.sql`
      SELECT ${NORMALIZED_IP_SQL} AS ip, COUNT(*)::int AS count, MIN(created_at) AS first_at, MAX(created_at) AS last_at
      FROM app.query_logs WHERE ${where} AND ip IS NOT NULL
      GROUP BY 1 ORDER BY count DESC, 1 ASC LIMIT ${LIST_LIMIT}`);
  }

  userAgents(where: Prisma.Sql): Promise<RawUserAgentUsage[]> {
    return this.prisma.$queryRaw<RawUserAgentUsage[]>(Prisma.sql`
      SELECT user_agent, COUNT(*)::int AS count, MAX(created_at) AS last_at
      FROM app.query_logs WHERE ${where} AND user_agent IS NOT NULL
      GROUP BY user_agent ORDER BY count DESC, user_agent ASC LIMIT ${LIST_LIMIT}`);
  }

  ipUsers(where: Prisma.Sql): Promise<RawIpUserUsage[]> {
    return this.prisma.$queryRaw<RawIpUserUsage[]>(Prisma.sql`
      SELECT user_id::text AS user_id, MAX(username_snapshot) AS username, COUNT(*)::int AS count,
        MIN(created_at) AS first_at, MAX(created_at) AS last_at
      FROM app.query_logs WHERE ${where}
      GROUP BY user_id ORDER BY count DESC, user_id ASC NULLS LAST LIMIT ${LIST_LIMIT}`);
  }
}
