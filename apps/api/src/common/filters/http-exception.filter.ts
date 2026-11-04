import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const STATUS_CODE_MAP: Record<number, string> = {
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN_API',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  502: 'UPSTREAM_ERROR',
  504: 'UPSTREAM_TIMEOUT',
};

/**
 * Normalizes every error response to the envelope from
 * reference-api-specification.md: `{ error: { code, message, requestId } }`.
 * Handlers may throw `new HttpException({ code, message }, status)` to pick a
 * specific machine-readable code; otherwise a sane default is derived from
 * the HTTP status.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    // Phase 05: reuse the per-request id set by RequestIdMiddleware so a
    // failing request's error envelope carries the SAME id as its
    // `X-Request-Id` response header and any query_logs row it produced.
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;

    let code = STATUS_CODE_MAP[status] ?? 'ERROR';
    let message = 'Unexpected error';
    let details: unknown;

    if (body && typeof body === 'object') {
      const asRecord = body as Record<string, unknown>;
      const nested = (asRecord.error as Record<string, unknown> | undefined) ?? asRecord;
      if (typeof nested.code === 'string') code = nested.code;
      if (typeof nested.message === 'string') message = nested.message;
      if (Array.isArray(nested.details)) details = nested.details;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      this.logger.error(message, exception instanceof Error ? exception.stack : undefined);
    }

    response
      .status(status)
      .json({ error: { code, message, ...(details ? { details } : {}), requestId: request?.requestId ?? randomUUID() } });
  }
}
