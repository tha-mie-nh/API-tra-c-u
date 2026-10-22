import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FEATURE_PERMISSION_CODES, type HistoryListResponse, type QueryLogDetail } from '@app/shared';
import { RequirePermission } from '../rbac/permission.decorator';
import { CurrentUser } from '../rbac/current-user.decorator';
import type { JwtUser } from '../rbac/jwt-user.interface';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { HistoryService } from './history.service';
import { listHistoryQuerySchema, type ListHistoryQueryDto } from './dto/list-history-query.dto';

/**
 * `GET /history[/:id]` (reference-api-specification.md). Either
 * `history:view_own` or `history:view_all` is enough to reach these
 * handlers — which one the caller actually holds decides the *scope* of
 * data returned, enforced entirely inside `HistoryService` (never here).
 */
@Controller('history')
@ApiTags('History')
@ApiBearerAuth('access-token')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  // Static route MUST come before `:id` below — NestJS matches in
  // declaration order, and `:id` would otherwise swallow this path as
  // id="datasources" (same pitfall as UsersController's
  // password-reset-requests routes).
  @RequirePermission(FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL)
  @Get('datasources')
  listDatasourceOptions(): { code: string; name: string }[] {
    return this.historyService.listDatasourceOptions();
  }

  @RequirePermission(FEATURE_PERMISSION_CODES.HISTORY_VIEW_OWN, FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL)
  @Get()
  list(
    @CurrentUser() user: JwtUser,
    // Parameter-scoped pipe — see QueryController.execute for why a
    // method-level @UsePipes() must NOT be used alongside @CurrentUser().
    @Query(new ZodValidationPipe(listHistoryQuerySchema)) query: ListHistoryQueryDto,
  ): Promise<HistoryListResponse> {
    return this.historyService.list(user, new Set(user.permissions ?? []), query);
  }

  @RequirePermission(FEATURE_PERMISSION_CODES.HISTORY_VIEW_OWN, FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL)
  @Get(':id')
  get(@CurrentUser() user: JwtUser, @Param('id') id: string): Promise<QueryLogDetail> {
    return this.historyService.get(user, new Set(user.permissions ?? []), id);
  }
}
