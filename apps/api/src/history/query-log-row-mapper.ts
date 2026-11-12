import { Injectable } from '@nestjs/common';
import type { QueryLogDetail, QueryLogListItem } from '@app/shared';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import type { QueryLogRowView } from './query-log-row.types';
import { summarizeQueryParams } from './sensitive-value-mask.util';

/**
 * Row -> API shape. `query_logs` stores the REAL lookup params; masking
 * happens here, at read-time, gated on `history:view_sensitive`, so the same
 * data serves ADMIN (full) and OPERATOR/AUDITOR (masked) — list, detail and
 * CSV all go through this one mapper.
 */
@Injectable()
export class QueryLogRowMapper {
  constructor(private readonly datasourceRegistry: DatasourceRegistryService) {}

  maskedParams(row: QueryLogRowView, canViewSensitive: boolean): { summary: string; params: Record<string, unknown> } {
    const rawParams = (row.queryParams as Record<string, unknown> | null) ?? {};
    if (canViewSensitive) return { summary: row.querySummary ?? '', params: rawParams };

    let entry: ReturnType<DatasourceRegistryService['get']> | undefined;
    try {
      entry = this.datasourceRegistry.get(row.datasourceCode);
    } catch {
      entry = undefined; // datasource no longer resolvable — no config to project from, so params come back empty (safe direction)
    }
    return summarizeQueryParams(entry?.config, rawParams, { mask: true });
  }

  toListItem(row: QueryLogRowView, canViewSensitive: boolean): QueryLogListItem {
    return {
      id: row.id,
      userId: row.userId,
      username: row.usernameSnapshot,
      datasourceCode: row.datasourceCode,
      querySummary: this.maskedParams(row, canViewSensitive).summary,
      status: row.status,
      statusCode: row.statusCode,
      errorCode: row.errorCode,
      recordCount: row.recordCount,
      durationMs: row.durationMs,
      createdAt: row.createdAt.toISOString(),
    };
  }

  toDetail(row: QueryLogRowView, canViewSensitive: boolean): QueryLogDetail {
    const { summary, params } = this.maskedParams(row, canViewSensitive);
    return {
      ...this.toListItem(row, canViewSensitive),
      querySummary: summary,
      queryParams: params,
      errorMessage: row.errorMessage,
      upstreamRequestId: row.upstreamRequestId,
      ip: row.ip,
      userAgent: row.userAgent,
    };
  }
}
