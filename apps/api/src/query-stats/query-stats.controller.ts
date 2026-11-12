import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  FEATURE_PERMISSION_CODES,
  type QueryStatsDatasourceDetailResponse,
  type QueryStatsOverviewResponse,
} from '@app/shared';
import { RequirePermission } from '../rbac/permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  datasourceCodeParamSchema,
  queryStatsQuerySchema,
  type QueryStatsQueryDto,
} from './dto/query-stats-query.dto';
import { QueryStatsService } from './query-stats.service';

/** Admin query-log statistics (Vietnam time, UTC+7). */
@Controller('admin/query-stats')
@RequirePermission(FEATURE_PERMISSION_CODES.ADMIN_QUERY_STATS)
@ApiTags('Admin — Query stats')
@ApiBearerAuth('access-token')
export class QueryStatsController {
  constructor(private readonly service: QueryStatsService) {}

  @Get('overview')
  overview(
    @Query(new ZodValidationPipe(queryStatsQuerySchema)) query: QueryStatsQueryDto,
  ): Promise<QueryStatsOverviewResponse> {
    return this.service.overview(query);
  }

  @Get('datasources/:code')
  datasourceDetail(
    @Param(new ZodValidationPipe(datasourceCodeParamSchema)) params: { code: string },
    @Query(new ZodValidationPipe(queryStatsQuerySchema)) query: QueryStatsQueryDto,
  ): Promise<QueryStatsDatasourceDetailResponse> {
    return this.service.datasourceDetail(params.code, query);
  }
}
