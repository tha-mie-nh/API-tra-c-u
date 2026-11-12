import { Injectable, NotFoundException } from '@nestjs/common';
import { FEATURE_PERMISSION_CODES, QUERY_INSIGHTS_RULES, type QueryInsightsAnomalies, type QueryInsightsErrorRow,
  type QueryInsightsIpActivity, type QueryInsightsLatencyRow, type QueryInsightsTopUserRow, type QueryInsightsUserActivity,
  type QueryInsightsDatasourceCount } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import { buildQueryLogWhereSql } from '../history/query-log-filter/query-log-where-sql.builder';
import { getSensitiveInputFieldNames, maskValue } from '../history/sensitive-value-mask.util';
import { toCounters } from '../query-stats/query-stats-aggregation.util';
import type { JwtUser } from '../rbac/jwt-user.interface';
import type { QueryInsightsQueryDto } from './dto/query-insights-query.dto';
import { QueryInsightsTopSqlRepository } from './query-insights-top-sql.repository';
import { QueryInsightsActivitySqlRepository } from './query-insights-activity-sql.repository';
import { ANOMALY_LIST_SEP, QueryInsightsAnomalySqlRepository } from './query-insights-anomaly-sql.repository';

const DAY_MS = 86_400_000;
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const split = (s: string | null): string[] => (s ? [...new Set(s.split(ANOMALY_LIST_SEP))].sort() : []);

/** Every route here is history:view_all (controller); scope is therefore always unrestricted. */
@Injectable()
export class QueryInsightsService {
  constructor(
    private readonly top: QueryInsightsTopSqlRepository,
    private readonly activity: QueryInsightsActivitySqlRepository,
    private readonly anomaly: QueryInsightsAnomalySqlRepository,
    private readonly registry: DatasourceRegistryService,
    private readonly prisma: PrismaService,
  ) {}

  private dsName(code: string): string | null {
    return this.registry.getAll().find((d) => d.code === code)?.name ?? null;
  }

  private dsCounts(rows: { datasource_code: string; count: number }[]): QueryInsightsDatasourceCount[] {
    return rows.map((r) => ({ datasourceCode: r.datasource_code, name: this.dsName(r.datasource_code), count: r.count }));
  }

  async topUsers(q: QueryInsightsQueryDto): Promise<QueryInsightsTopUserRow[]> {
    const rows = await this.top.topUsers(buildQueryLogWhereSql(q), q.metric, q.limit);
    return rows.map((r) => ({
      userId: r.user_id, username: r.username, ...toCounters(r), p95DurationMs: r.p95_duration_ms, lastAt: r.last_at.toISOString(),
    }));
  }

  async topErrors(q: QueryInsightsQueryDto): Promise<QueryInsightsErrorRow[]> {
    const rows = await this.top.topErrors(buildQueryLogWhereSql(q), q.limit);
    return rows.map((r) => ({ errorCode: r.error_code, statusCode: r.status_code, count: r.count }));
  }

  async datasourceLatency(q: QueryInsightsQueryDto): Promise<QueryInsightsLatencyRow[]> {
    const rows = await this.top.datasourceLatency(buildQueryLogWhereSql(q));
    return rows.map((r) => ({
      datasourceCode: r.datasource_code, name: this.dsName(r.datasource_code), requests: r.requests,
      avgDurationMs: r.avg_duration_ms, p95DurationMs: r.p95_duration_ms, maxDurationMs: r.max_duration_ms,
    }));
  }

  async userActivity(userId: string, q: QueryInsightsQueryDto): Promise<QueryInsightsUserActivity> {
    const where = buildQueryLogWhereSql({ ...q, userId });
    const [user, totals, allTime, byDs, ips, uas, snapshot] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, fullName: true, status: true, lastLoginAt: true } }),
      this.activity.totals(where),
      this.activity.span(buildQueryLogWhereSql({ userId })),
      this.activity.byDatasource(where),
      this.activity.ips(where),
      this.activity.userAgents(where),
      this.prisma.queryLog.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { usernameSnapshot: true } }),
    ]);
    if (!user && !allTime.first_at) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    return {
      user: user && { id: user.id, username: user.username, fullName: user.fullName, status: String(user.status), lastLoginAt: iso(user.lastLoginAt) },
      username: user?.username ?? snapshot?.usernameSnapshot ?? '',
      firstAt: iso(allTime.first_at), lastAt: iso(allTime.last_at),
      totals: toCounters(totals), byDatasource: this.dsCounts(byDs),
      ips: ips.map((r) => ({ ip: r.ip, count: r.count, firstAt: r.first_at.toISOString(), lastAt: r.last_at.toISOString() })),
      userAgents: uas.map((r) => ({ userAgent: r.user_agent, count: r.count, lastAt: r.last_at.toISOString() })),
    };
  }

  async ipActivity(ip: string, q: QueryInsightsQueryDto): Promise<QueryInsightsIpActivity> {
    const where = buildQueryLogWhereSql({ ...q, ip });
    const [totals, span, users, byDs, uas] = await Promise.all([
      this.activity.totals(where), this.activity.span(where), this.activity.ipUsers(where),
      this.activity.byDatasource(where), this.activity.userAgents(where),
    ]);
    return {
      ip, firstAt: iso(span.first_at), lastAt: iso(span.last_at), totals: toCounters(totals),
      users: users.map((r) => ({ userId: r.user_id, username: r.username, count: r.count, firstAt: r.first_at.toISOString(), lastAt: r.last_at.toISOString() })),
      multiAccount: users.filter((u) => u.user_id).length >= QUERY_INSIGHTS_RULES.sharedIpMinUsers,
      byDatasource: this.dsCounts(byDs),
      userAgents: uas.map((r) => ({ userAgent: r.user_agent, count: r.count, lastAt: r.last_at.toISOString() })),
    };
  }

  /** Thresholds are in `rules`. Shared-identity rows are masked unless the caller has history:view_sensitive. */
  async anomalies(user: Pick<JwtUser, 'permissions'>, q: QueryInsightsQueryDto): Promise<QueryInsightsAnomalies> {
    const canViewSensitive = (user.permissions ?? []).includes(FEATURE_PERMISSION_CODES.HISTORY_VIEW_SENSITIVE);
    const where = buildQueryLogWhereSql(q);
    const baselineWhere = buildQueryLogWhereSql({ ...q, from: new Date(q.from!.getTime() - QUERY_INSIGHTS_RULES.spikeBaselineDays * DAY_MS) });
    const pairs = this.registry.getAll().flatMap((e) => getSensitiveInputFieldNames(e).map((field) => ({ code: e.code, field })));
    const [spikes, off, identities, ips] = await Promise.all([
      this.anomaly.spikes(baselineWhere, q.from!), this.anomaly.offHours(where),
      this.anomaly.sharedIdentities(where, pairs), this.anomaly.sharedIps(where),
    ]);
    return {
      rules: QUERY_INSIGHTS_RULES,
      spikes: spikes.map((r) => ({ userId: r.user_id, username: r.username, day: r.day, count: r.count, baselineAvg: r.baseline_avg })),
      offHours: off.map((r) => ({
        userId: r.user_id, username: r.username, offHoursCount: r.off_count, total: r.total,
        ratio: r.total ? Math.round((r.off_count / r.total) * 1000) / 1000 : 0, firstAt: r.first_at.toISOString(), lastAt: r.last_at.toISOString(),
      })),
      sharedIdentities: identities.map((r) => ({
        fieldNames: split(r.field_names), valueDisplay: canViewSensitive ? r.val : maskValue(r.val),
        datasourceCodes: split(r.datasource_codes), distinctUsers: r.distinct_users, requests: r.requests,
        users: r.users.slice(0, 20), firstAt: r.first_at.toISOString(), lastAt: r.last_at.toISOString(),
      })),
      sharedIps: ips.map((r) => ({ ip: r.ip, distinctUsers: r.distinct_users, usernames: r.usernames, requests: r.requests, lastAt: r.last_at.toISOString() })),
    };
  }
}
