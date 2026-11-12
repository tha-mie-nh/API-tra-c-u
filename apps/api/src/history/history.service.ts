import { Injectable, NotFoundException } from '@nestjs/common';
import type { HistoryListResponse, HistorySummaryResponse, QueryLogDetail } from '@app/shared';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import type { JwtUser } from '../rbac/jwt-user.interface';
import type { ListHistoryQueryDto } from './dto/list-history-query.dto';
import { HistoryListSqlRepository } from './history-list-sql.repository';
import { resolveQueryLogScope } from './query-log-filter/resolve-query-log-scope';
import { buildQueryLogWhereSql } from './query-log-filter/query-log-where-sql.builder';
import type { QueryLogFilter } from './query-log-filter/query-log-filter-query.schema';
import { QueryLogRowMapper } from './query-log-row-mapper';

/**
 * `GET /history[/summary|/:id]` — permission-scoped reads. The single most
 * security-sensitive rule: a `history:view_own`-only caller's scope is FORCED
 * to their own id here (resolveQueryLogScope -> builder), never taken from
 * the query string.
 */
@Injectable()
export class HistoryService {
  constructor(
    private readonly repo: HistoryListSqlRepository,
    private readonly mapper: QueryLogRowMapper,
    private readonly datasourceRegistry: DatasourceRegistryService,
  ) {}

  /** Every ENABLED datasource is a valid filter value regardless of the viewer's own api:* rights (AUDITOR has none). */
  listDatasourceOptions(): { code: string; name: string }[] {
    return this.datasourceRegistry
      .getAll()
      .filter((ds) => ds.enabled)
      .map((ds) => ({ code: ds.code, name: ds.name }));
  }

  async list(caller: JwtUser, permissions: Set<string>, query: ListHistoryQueryDto): Promise<HistoryListResponse> {
    const { scope, canViewSensitive } = resolveQueryLogScope(caller, permissions);
    const where = buildQueryLogWhereSql(query, scope);
    const { page, pageSize } = query;

    const [rows, total] = await Promise.all([
      this.repo.list(where, query.sort, query.order, (page - 1) * pageSize, pageSize),
      this.repo.count(where),
    ]);
    return { items: rows.map((r) => this.mapper.toListItem(r, canViewSensitive)), page, pageSize, total };
  }

  summary(caller: JwtUser, permissions: Set<string>, filter: QueryLogFilter): Promise<HistorySummaryResponse> {
    const { scope } = resolveQueryLogScope(caller, permissions);
    return this.repo.summary(buildQueryLogWhereSql(filter, scope));
  }

  async get(caller: JwtUser, permissions: Set<string>, id: string): Promise<QueryLogDetail> {
    const { canViewAll, canViewSensitive } = resolveQueryLogScope(caller, permissions);
    const row = await this.repo.findById(id);
    // view_own caller fetching someone else's id gets 404, not 403 — existence is not confirmed.
    if (!row || (!canViewAll && row.userId !== caller.id)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Query log not found' });
    }
    return this.mapper.toDetail(row, canViewSensitive);
  }
}
