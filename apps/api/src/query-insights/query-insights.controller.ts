import { Controller, ForbiddenException, Get, Param, Query, Req, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  FEATURE_PERMISSION_CODES, type QueryInsightsAnomalies, type QueryInsightsCsvTable, type QueryInsightsErrorRow,
  type QueryInsightsIpActivity, type QueryInsightsLatencyRow, type QueryInsightsTopUserRow, type QueryInsightsUserActivity,
} from '@app/shared';
import { RequirePermission } from '../rbac/permission.decorator';
import { CurrentUser } from '../rbac/current-user.decorator';
import type { JwtUser } from '../rbac/jwt-user.interface';
import { AuditAction } from '../audit/audit-action.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  exportQuerySchema, ipParamSchema, queryInsightsQuerySchema, userIdParamSchema,
  type QueryInsightsQueryDto,
} from './dto/query-insights-query.dto';
import { QueryInsightsService } from './query-insights.service';
import { QueryInsightsCsvService } from './query-insights-csv.service';

const { HISTORY_VIEW_ALL, HISTORY_EXPORT } = FEATURE_PERMISSION_CODES;
const filterPipe = new ZodValidationPipe(queryInsightsQuerySchema);

/** Cross-user analytics over query logs: history:view_all for all routes, history:export (+view_all) for CSV. */
@Controller('admin/query-insights')
@RequirePermission(HISTORY_VIEW_ALL)
@ApiTags('Admin — Query insights')
@ApiBearerAuth('access-token')
export class QueryInsightsController {
  constructor(
    private readonly service: QueryInsightsService,
    private readonly csv: QueryInsightsCsvService,
  ) {}

  @Get('top-users')
  topUsers(@Query(filterPipe) q: QueryInsightsQueryDto): Promise<QueryInsightsTopUserRow[]> {
    return this.service.topUsers(q);
  }

  @Get('top-errors')
  topErrors(@Query(filterPipe) q: QueryInsightsQueryDto): Promise<QueryInsightsErrorRow[]> {
    return this.service.topErrors(q);
  }

  @Get('datasource-latency')
  latency(@Query(filterPipe) q: QueryInsightsQueryDto): Promise<QueryInsightsLatencyRow[]> {
    return this.service.datasourceLatency(q);
  }

  // Audit = filters + params only (capture:'request'); response may hold PII.
  @AuditAction('query_log.view_user_activity', 'user', { capture: 'request', targetParam: 'userId' })
  @Get('users/:userId/activity')
  userActivity(
    @Param(new ZodValidationPipe(userIdParamSchema)) p: { userId: string },
    @Query(filterPipe) q: QueryInsightsQueryDto,
  ): Promise<QueryInsightsUserActivity> {
    return this.service.userActivity(p.userId, q);
  }

  @AuditAction('query_log.view_ip_activity', 'ip', { capture: 'request', targetParam: 'ip' })
  @Get('ips/:ip/activity')
  ipActivity(
    @Param(new ZodValidationPipe(ipParamSchema)) p: { ip: string },
    @Query(filterPipe) q: QueryInsightsQueryDto,
  ): Promise<QueryInsightsIpActivity> {
    return this.service.ipActivity(p.ip, q);
  }

  @AuditAction('query_insights.view_anomalies', 'query_insights', { capture: 'request' })
  @Get('anomalies')
  anomalies(@CurrentUser() user: JwtUser, @Query(filterPipe) q: QueryInsightsQueryDto): Promise<QueryInsightsAnomalies> {
    return this.service.anomalies(user, q);
  }

  @RequirePermission(HISTORY_EXPORT)
  @AuditAction('query_insights.export_csv', 'query_insights', { capture: 'request' })
  @Get('export.csv')
  async exportCsv(
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
    @Query(new ZodValidationPipe(exportQuerySchema)) q: QueryInsightsQueryDto & { table: QueryInsightsCsvTable },
  ): Promise<StreamableFile> {
    // history:export alone must not expose cross-user data: also require view_all.
    if (!(user.permissions ?? []).includes(HISTORY_VIEW_ALL)) {
      throw new ForbiddenException({ code: 'FORBIDDEN_API', message: 'Access denied' });
    }
    const out = await this.csv.build(q.table, user, q);
    req.auditExtra = { table: q.table, rows: out.rows };
    req.res!.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    return new StreamableFile(Buffer.from(out.body, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${out.filename}"`,
    });
  }
}
