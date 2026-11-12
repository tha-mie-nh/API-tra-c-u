import { Controller, Get, Param, Query, Req, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  FEATURE_PERMISSION_CODES,
  type HistoryListResponse,
  type HistorySummaryResponse,
  type QueryLogDetail,
  type QueryLogPayloadResponse,
} from '@app/shared';
import { RequirePermission } from '../rbac/permission.decorator';
import { CurrentUser } from '../rbac/current-user.decorator';
import type { JwtUser } from '../rbac/jwt-user.interface';
import { AuditAction } from '../audit/audit-action.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { HistoryService } from './history.service';
import { HistoryPayloadService } from './history-payload.service';
import { HistoryExportCsvService } from './history-export-csv.service';
import { listHistoryQuerySchema, type ListHistoryQueryDto } from './dto/list-history-query.dto';
import { queryLogFilterQuerySchema, type QueryLogFilter } from './query-log-filter/query-log-filter-query.schema';

const idParamSchema = z.uuid();
const { HISTORY_VIEW_OWN, HISTORY_VIEW_ALL, HISTORY_EXPORT, HISTORY_VIEW_PAYLOAD } = FEATURE_PERMISSION_CODES;

/**
 * `GET /history[/summary|/export.csv|/:id]`. Either `history:view_own` or
 * `history:view_all` reaches list/detail — which one the caller holds decides
 * the *scope*, enforced inside the services (never here).
 */
@Controller('history')
@ApiTags('History')
@ApiBearerAuth('access-token')
export class HistoryController {
  constructor(
    private readonly historyService: HistoryService,
    private readonly exportService: HistoryExportCsvService,
    private readonly payloadService: HistoryPayloadService,
  ) {}

  // Static routes MUST come before `:id` — Nest matches in declaration order.
  @RequirePermission(HISTORY_VIEW_ALL)
  @Get('datasources')
  listDatasourceOptions(): { code: string; name: string }[] {
    return this.historyService.listDatasourceOptions();
  }

  @RequirePermission(HISTORY_VIEW_ALL)
  @Get('summary')
  summary(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(queryLogFilterQuerySchema)) filter: QueryLogFilter,
  ): Promise<HistorySummaryResponse> {
    return this.historyService.summary(user, new Set(user.permissions ?? []), filter);
  }

  // Audit: request-only (filters + counts), never the CSV body — it may hold real CCCD.
  @RequirePermission(HISTORY_EXPORT)
  @AuditAction('query_log.export_csv', 'query_log', { capture: 'request' })
  @Get('export.csv')
  async exportCsv(
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
    @Query(new ZodValidationPipe(queryLogFilterQuerySchema)) filter: QueryLogFilter,
  ): Promise<StreamableFile> {
    const out = await this.exportService.prepare(user, new Set(user.permissions ?? []), filter);
    req.auditExtra = { matched: out.matched, exported: out.exported, truncated: out.truncated, maxRows: out.maxRows };
    const res = req.res!;
    res.setHeader('X-Export-Total', String(out.matched));
    res.setHeader('X-Export-Exported', String(out.exported));
    res.setHeader('X-Export-Truncated', String(out.truncated));
    res.setHeader('Access-Control-Expose-Headers', 'X-Export-Total, X-Export-Exported, X-Export-Truncated, Content-Disposition');
    return new StreamableFile(out.stream, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${out.filename}"`,
    });
  }

  @RequirePermission(HISTORY_VIEW_OWN, HISTORY_VIEW_ALL)
  @Get()
  list(
    @CurrentUser() user: JwtUser,
    // Parameter-scoped pipe — a method-level @UsePipes() must NOT be used alongside @CurrentUser().
    @Query(new ZodValidationPipe(listHistoryQuerySchema)) query: ListHistoryQueryDto,
  ): Promise<HistoryListResponse> {
    return this.historyService.list(user, new Set(user.permissions ?? []), query);
  }

  // Raw request/response snapshot (may hold real CCCD): audited like view_detail; scope view_all enforced in the service.
  @RequirePermission(HISTORY_VIEW_PAYLOAD)
  @AuditAction('query_log.view_payload', 'query_log', { capture: 'request' })
  @Get(':id/payload')
  getPayload(
    @CurrentUser() user: JwtUser,
    @Param('id', new ZodValidationPipe(idParamSchema)) id: string,
  ): Promise<QueryLogPayloadResponse> {
    return this.payloadService.get(user, new Set(user.permissions ?? []), id);
  }

  // Audit only on success (a 404 never reaches the interceptor's tap); `after` = {filters, params}, no payload.
  @RequirePermission(HISTORY_VIEW_OWN, HISTORY_VIEW_ALL)
  @AuditAction('query_log.view_detail', 'query_log', { capture: 'request' })
  @Get(':id')
  get(@CurrentUser() user: JwtUser, @Param('id', new ZodValidationPipe(idParamSchema)) id: string): Promise<QueryLogDetail> {
    return this.historyService.get(user, new Set(user.permissions ?? []), id);
  }
}
