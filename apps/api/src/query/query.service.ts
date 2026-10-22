import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { QueryEnvelope } from '@app/shared';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import { ResponseMapperService } from '../datasources/response-mapper.service';
import { UpstreamError, UpstreamTimeoutError } from '../datasources/adapters/adapter-errors';
import type { JwtUser } from '../rbac/jwt-user.interface';
import { QueryLogService } from '../history/query-log.service';

export interface ExecuteQueryInput {
  code: string;
  params: Record<string, unknown>;
  page?: number;
  pageSize?: number;
  user: JwtUser;
  requestId: string;
  ip?: string | null;
  userAgent?: string;
}

interface TranslatedError {
  code: string;
  message: string;
  status: HttpStatus;
}

/**
 * Orchestrates `POST /query/:code` (phase-05 Implementation Step 3): clamp
 * paging -> validate params (cached per-datasource Zod schema) -> run the
 * adapter -> map to the unified envelope -> ALWAYS record a `query_logs`
 * row, success or failure -> strip `internal` fields before returning.
 */


// các cách sử lí query từ client
@Injectable()
export class QueryService {
  constructor(
    private readonly registry: DatasourceRegistryService,
    private readonly mapper: ResponseMapperService,
    private readonly queryLogService: QueryLogService,
  ) {}

  async execute(input: ExecuteQueryInput): Promise<QueryEnvelope> {
    const { config, adapter, inputSchema } = this.registry.get(input.code);

    const parsed = inputSchema.safeParse(input.params);
    if (!parsed.success) {
      await this.queryLogService.record({
        userId: input.user.id,
        username: input.user.username,
        datasourceCode: input.code,
        status: 'failed',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        params: input.params,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'Request validation failed',
        requestId: input.requestId,
        ip: input.ip,
        userAgent: input.userAgent,
      });
      throw new HttpException(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const validatedParams = parsed.data as Record<string, unknown>;

    const configuredPageSize = config.limits?.pageSize ?? 20;
    const pageSize = Math.min(Math.max(input.pageSize ?? configuredPageSize, 1), configuredPageSize);
    const page = Math.max(input.page ?? 1, 1);

    const startedAt = Date.now();
    try {
      const result = await adapter.execute({ params: validatedParams, page, pageSize });
      const tookMs = Date.now() - startedAt;

      const envelope = this.mapper.map(result.records, config, { page, pageSize, requestId: input.requestId, tookMs });
      const clientEnvelope = this.mapper.toClientEnvelope(envelope, config);

      await this.queryLogService.record({
        userId: input.user.id,
        username: input.user.username,
        datasourceCode: input.code,
        status: 'success',
        statusCode: HttpStatus.OK,
        params: validatedParams,
        recordCount: envelope.page.returned,
        upstreamRequestId: result.requestId,
        durationMs: tookMs,
        requestId: input.requestId,
        ip: input.ip,
        userAgent: input.userAgent,
      });
      return clientEnvelope;
    } catch (err) {
      const tookMs = Date.now() - startedAt;
      const translated = this.translateError(err);

      await this.queryLogService.record({
        userId: input.user.id,
        username: input.user.username,
        datasourceCode: input.code,
        status: 'failed',
        statusCode: translated.status,
        params: validatedParams,
        errorCode: translated.code,
        errorMessage: translated.message,
        durationMs: tookMs,
        requestId: input.requestId,
        ip: input.ip,
        userAgent: input.userAgent,
      });
      // Never leak internal detail (upstream body, stack trace, credentials) — only the mapped code/message.
      throw new HttpException({ error: { code: translated.code, message: translated.message } }, translated.status);
    }
  }

  private translateError(err: unknown): TranslatedError {
    if (err instanceof UpstreamTimeoutError) {
      return { code: 'UPSTREAM_TIMEOUT', message: 'Upstream datasource timed out', status: HttpStatus.GATEWAY_TIMEOUT };
    }
    if (err instanceof UpstreamError) {
      return { code: 'UPSTREAM_ERROR', message: 'Upstream datasource request failed', status: HttpStatus.BAD_GATEWAY };
    }
    return { code: 'UPSTREAM_ERROR', message: 'Upstream datasource request failed', status: HttpStatus.BAD_GATEWAY };
  }
}
