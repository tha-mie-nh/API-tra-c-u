import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryStatus, type Prisma } from '@prisma/client';
import type { QueryLogStatus } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import { normalizeClientIp } from '../common/utils/client-ip.util';
import type { UpstreamExchange } from '../datasources/adapters/datasource-adapter.interface';
import { summarizeQueryParams } from './sensitive-value-mask.util';
import { collectImageKeys, sanitizePayloadParts } from './query-log-payload-sanitizer.util';
import { readPayloadConfig } from './query-log-payload.config';

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
  /** Upstream I/O snapshot (admin payload monitor). */
  exchange?: UpstreamExchange | null;
  /** Exact JSON returned to the client (envelope, or `{error:{...}}`). */
  clientResponse?: unknown;
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
    private readonly config: ConfigService,
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
      const data: Prisma.QueryLogCreateInput = {
        user: input.userId ? { connect: { id: input.userId } } : undefined,
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
      };
      const payload = this.buildPayload(input, entry?.config);
      if (payload) {
        try {
          await this.prisma.queryLog.create({ data: { ...data, payload: { create: payload } } });
          return;
        } catch (err) {
          // A bad payload must not lose the query_logs row: log and fall through to the payload-less insert.
          this.logger.error(`Failed to write query_log_payloads for "${input.datasourceCode}"; retrying without payload`, err as Error);
        }
      }
      await this.prisma.queryLog.create({ data });
    } catch (err) {
      this.logger.error(`Failed to write query_logs row for "${input.datasourceCode}" (status=${input.status})`, err as Error);
    }
  }

  /** Sanitized payload columns, or null when capture is disabled / nothing to store. Never throws. */
  private buildPayload(
    input: RecordQueryLogInput,
    datasource: ReturnType<DatasourceRegistryService['get']>['config'] | undefined,
  ): Prisma.QueryLogPayloadCreateWithoutQueryLogInput | null {
    try {
      const cfg = readPayloadConfig((k) => this.config.get<string>(k));
      if (!cfg.enabled) return null;
      const parts = sanitizePayloadParts(
        {
          upstreamRequest: input.exchange?.request ?? null,
          upstreamResponse: input.exchange?.response ?? null,
          clientResponse: input.clientResponse ?? null,
        },
        { maxBytes: cfg.maxBytes, imageKeys: collectImageKeys(datasource) },
      );
      if (!parts.upstreamRequest && !parts.upstreamResponse && parts.clientResponse === null) return null;
      const json = (v: unknown) => (v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue));
      return {
        upstreamRequest: json(parts.upstreamRequest),
        upstreamResponse: json(parts.upstreamResponse),
        clientResponse: json(parts.clientResponse),
      };
    } catch (err) {
      this.logger.error(`Failed to build payload snapshot for "${input.datasourceCode}"`, err as Error);
      return null;
    }
  }

  /** Convenience wrapper used by DatasourcePermissionGuard — no query params exist yet at denial time (validation hasn't run). */
  recordDenied(input: Omit<RecordQueryLogInput, 'status' | 'params' | 'statusCode'>): Promise<void> {
    return this.record({ ...input, status: 'denied', statusCode: 403 });
  }
}
