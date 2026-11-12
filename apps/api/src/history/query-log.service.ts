import { Injectable, Logger } from '@nestjs/common';
import { QueryStatus, type Prisma } from '@prisma/client';
import type { QueryLogStatus } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import { normalizeClientIp } from '../common/utils/client-ip.util';
import { summarizeQueryParams } from './sensitive-value-mask.util';

export interface RecordQueryLogInput {
  userId: string | null;
  username: string;
  datasourceCode: string;
  status: QueryLogStatus;
  /** Real HTTP status code (200-599) this lookup resolved to (review
   * feedback: "phân loại theo trường tt — cần rõ status code group của
   * query") — more granular than `status`, which only has 3 buckets.
   * e.g. 422 (bad input) and 504 (upstream timeout) are both `status:
   * FAILED` but tell a very different story. */
  statusCode: number;
  /** Raw input params — stored AS-IS (review feedback: an ADMIN must be able
   * to see the real lookup id in history, not a permanently-masked "***").
   * `HistoryService` is solely responsible for masking at read-time based on
   * the viewer's `history:view_sensitive` permission. */
  params?: Record<string, unknown>;
  recordCount?: number;
  errorCode?: string;
  errorMessage?: string;
  upstreamRequestId?: string;
  durationMs?: number;
  requestId?: string;
  ip?: string | null;
  userAgent?: string | null;
}

const STATUS_MAP: Record<QueryLogStatus, QueryStatus> = {
  success: QueryStatus.SUCCESS,
  failed: QueryStatus.FAILED,
  denied: QueryStatus.DENIED,
};

/**
 * The SINGLE writer to `query_logs` (phase-05 Architecture). Called from
 * `QueryService` (success/failed) and `DatasourcePermissionGuard` (denied).
 * Log-write failures are swallowed (logged, not thrown) — a logging outage
 * must never break a user's lookup (Risk Assessment).
 */
@Injectable()
export class QueryLogService {
  private readonly logger = new Logger(QueryLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DatasourceRegistryService,
  ) {}

  async record(input: RecordQueryLogInput): Promise<void> {
    try {
      let entry: ReturnType<DatasourceRegistryService['get']> | undefined;
      try {
        entry = this.registry.get(input.datasourceCode);
      } catch {
        entry = undefined; // unknown code — fall back to an empty summary rather than throwing from a log writer
      }
      const { summary, params } = summarizeQueryParams(entry?.config, input.params ?? {}, { mask: false });
      await this.prisma.queryLog.create({
        data: {
          userId: input.userId,
          usernameSnapshot: input.username,
          datasourceCode: input.datasourceCode,
          queryParams: params as Prisma.InputJsonValue,
          querySummary: summary,
          status: STATUS_MAP[input.status],
          statusCode: input.statusCode,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          recordCount: input.recordCount ?? null,
          upstreamRequestId: input.upstreamRequestId ?? null,
          durationMs: input.durationMs ?? null,
          ip: normalizeClientIp(input.ip),
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write query_logs row for "${input.datasourceCode}" (status=${input.status})`, err as Error);
    }
  }

  /** Convenience wrapper used by DatasourcePermissionGuard — no query params exist yet at denial time (validation hasn't run). */
  recordDenied(input: Omit<RecordQueryLogInput, 'status' | 'params' | 'statusCode'>): Promise<void> {
    return this.record({ ...input, status: 'denied', statusCode: 403 });
  }
}
