import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryStatus, type Prisma, type QueryLog } from '@prisma/client';
import { FEATURE_PERMISSION_CODES, type HistoryListResponse, type QueryLogDetail, type QueryLogListItem, type QueryLogStatus } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import type { JwtUser } from '../rbac/jwt-user.interface';
import type { ListHistoryQueryDto } from './dto/list-history-query.dto';
import { summarizeQueryParams } from './sensitive-value-mask.util';

const STATUS_TO_CLIENT: Record<QueryStatus, QueryLogStatus> = {
  [QueryStatus.SUCCESS]: 'success',
  [QueryStatus.FAILED]: 'failed',
  [QueryStatus.DENIED]: 'denied',
};
const STATUS_FROM_CLIENT: Record<QueryLogStatus, QueryStatus> = {
  success: QueryStatus.SUCCESS,
  failed: QueryStatus.FAILED,
  denied: QueryStatus.DENIED,
};

/**
 * `GET /history[/:id]` — permission-scoped reads (phase-05 Implementation
 * Steps 8-9). The single most security-sensitive rule in this phase: a
 * `history:view_own`-only caller's `userId` scope is FORCED to their own id
 * server-side, never taken from the query string, no matter what the client
 * sends (reference-api-specification.md Security Considerations / this
 * phase's Risk Assessment "Horizontal privilege escalation in history").
 */
@Injectable()
export class HistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly datasourceRegistry: DatasourceRegistryService,
  ) {}

  /**
   * Datasource options for the history page's "lọc theo API" dropdown.
   * Deliberately NOT `datasourceRegistry.getForUser()` (the caller's own
   * query-permission set) — review feedback: an AUDITOR holds
   * `history:view_all` but typically holds zero `api:*` permissions, so
   * that filter would always render empty for them even though they can
   * (and need to) see every datasource's history. Every ENABLED datasource
   * is a valid filter value regardless of the viewer's own query rights.
   */
  listDatasourceOptions(): { code: string; name: string }[] {
    return this.datasourceRegistry
      .getAll()
      .filter((ds) => ds.enabled)
      .map((ds) => ({ code: ds.code, name: ds.name }));
  }

  async list(caller: JwtUser, permissions: Set<string>, filters: ListHistoryQueryDto): Promise<HistoryListResponse> {
    const canViewAll = permissions.has(FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL);
    // Ignores filters.username entirely unless the caller has view_all —
    // this is the enforcement point, not the controller/guard, so it holds
    // even if a future route re-uses this service.
    const scopedUserId = canViewAll ? undefined : caller.id;
    const usernameFilter = canViewAll ? filters.username : undefined;

    const where = this.buildWhere(scopedUserId, usernameFilter, filters);
    const page = Math.max(filters.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100);

    const [rows, total] = await Promise.all([
      this.prisma.queryLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.queryLog.count({ where }),
    ]);

    const canViewSensitive = permissions.has(FEATURE_PERMISSION_CODES.HISTORY_VIEW_SENSITIVE);
    return { items: rows.map((row) => this.toListItem(row, canViewSensitive)), page, pageSize, total };
  }

  async get(caller: JwtUser, permissions: Set<string>, id: string): Promise<QueryLogDetail> {
    const canViewAll = permissions.has(FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL);
    const row = await this.prisma.queryLog.findUnique({ where: { id } });

    // A view_own caller fetching another user's log id gets 404, not 403 —
    // do not confirm the row exists (Implementation Step 9).
    if (!row || (!canViewAll && row.userId !== caller.id)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Query log not found' });
    }
    const canViewSensitive = permissions.has(FEATURE_PERMISSION_CODES.HISTORY_VIEW_SENSITIVE);
    return this.toDetail(row, canViewSensitive);
  }

  private buildWhere(
    userId: string | undefined,
    username: string | undefined,
    filters: ListHistoryQueryDto,
  ): Prisma.QueryLogWhereInput {
    const where: Prisma.QueryLogWhereInput = {};
    if (userId) where.userId = userId;
    if (username) where.usernameSnapshot = { contains: username, mode: 'insensitive' };
    if (filters.datasourceCode) where.datasourceCode = filters.datasourceCode;
    if (filters.status) where.status = STATUS_FROM_CLIENT[filters.status];
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    return where;
  }

  /**
   * `query_logs` stores the REAL lookup params (`QueryLogService` no longer
   * masks at write-time). Masking happens here, at read-time, gated on the
   * viewer's `history:view_sensitive` — not baked into the stored row — so
   * the same data serves both an ADMIN (full) and an OPERATOR/AUDITOR
   * (`***`) without two copies.
   */
  private maskedParams(row: QueryLog, canViewSensitive: boolean): { summary: string; params: Record<string, unknown> } {
    const rawParams = (row.queryParams as Record<string, unknown> | null) ?? {};
    if (canViewSensitive) return { summary: row.querySummary ?? '', params: rawParams };

    let entry: ReturnType<DatasourceRegistryService['get']> | undefined;
    try {
      entry = this.datasourceRegistry.get(row.datasourceCode);
    } catch {
      entry = undefined; // datasource code no longer resolvable — fall back to the raw (already real) values
    }
    return summarizeQueryParams(entry?.config, rawParams, { mask: true });
  }

  private toListItem(row: QueryLog, canViewSensitive: boolean): QueryLogListItem {
    return {
      id: row.id,
      userId: row.userId,
      username: row.usernameSnapshot,
      datasourceCode: row.datasourceCode,
      querySummary: this.maskedParams(row, canViewSensitive).summary,
      status: STATUS_TO_CLIENT[row.status],
      statusCode: row.statusCode,
      errorCode: row.errorCode,
      recordCount: row.recordCount,
      durationMs: row.durationMs,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toDetail(row: QueryLog, canViewSensitive: boolean): QueryLogDetail {
    const { summary, params } = this.maskedParams(row, canViewSensitive);
    return {
      id: row.id,
      userId: row.userId,
      username: row.usernameSnapshot,
      datasourceCode: row.datasourceCode,
      querySummary: summary,
      status: STATUS_TO_CLIENT[row.status],
      statusCode: row.statusCode,
      errorCode: row.errorCode,
      recordCount: row.recordCount,
      durationMs: row.durationMs,
      createdAt: row.createdAt.toISOString(),
      queryParams: params,
      errorMessage: row.errorMessage,
      upstreamRequestId: row.upstreamRequestId,
    };
  }
}
