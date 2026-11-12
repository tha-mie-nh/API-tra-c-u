import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { QueryLogPayloadParts, QueryLogPayloadResponse } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../rbac/jwt-user.interface';
import { HistoryListSqlRepository } from './history-list-sql.repository';
import { QueryLogRowMapper } from './query-log-row-mapper';
import { resolveQueryLogScope } from './query-log-filter/resolve-query-log-scope';

/** `GET /history/:id/payload` — admin I/O monitor. Stored values are returned exactly (no masking): admin-only via history:view_payload, always audited. */
@Injectable()
export class HistoryPayloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: HistoryListSqlRepository,
    private readonly mapper: QueryLogRowMapper,
  ) {}

  async get(caller: JwtUser, permissions: Set<string>, id: string): Promise<QueryLogPayloadResponse> {
    const { canViewAll, canViewSensitive } = resolveQueryLogScope(caller, permissions);
    // Raw I/O of other users' lookups: only the all-history scope may see it.
    if (!canViewAll) throw new ForbiddenException({ code: 'FORBIDDEN_API', message: 'Access denied' });

    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Query log not found' });

    const clientRequest = this.mapper.maskedParams(row, canViewSensitive).params;
    const payload = await this.prisma.queryLogPayload.findUnique({ where: { queryLogId: id } });
    if (!payload) {
      return {
        queryLogId: id,
        captured: false,
        capturedAt: null,
        clientRequest,
        masked: false,
        upstreamRequest: null,
        upstreamResponse: null,
        clientResponse: null,
      };
    }

    const parts: QueryLogPayloadParts = {
      upstreamRequest: payload.upstreamRequest as QueryLogPayloadParts['upstreamRequest'],
      upstreamResponse: payload.upstreamResponse as QueryLogPayloadParts['upstreamResponse'],
      clientResponse: payload.clientResponse ?? null,
    };
    return {
      queryLogId: id,
      captured: true,
      capturedAt: payload.createdAt.toISOString(),
      clientRequest,
      masked: false,
      ...parts,
    };
  }
}
