import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { QueryEnvelope } from '@app/shared';
import { RequirePermission } from '../rbac/permission.decorator';
import { CurrentUser } from '../rbac/current-user.decorator';
import type { JwtUser } from '../rbac/jwt-user.interface';
import { RequestId } from '../common/decorators/request-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DatasourcePermissionGuard } from './datasource-permission.guard';
import { QueryThrottlerGuard } from './query-throttler.guard';
import { QueryService } from './query.service';
import { ImageProxyService } from './image-proxy.service';
import { queryRequestSchema, type QueryRequestDto } from './dto/query-request.dto';

/**
 * `POST /query/:code` + `GET /query/:code/image/:recordId[/thumb]`
 * (reference-api-specification.md). ONE generic handler serves every
 * datasource — adding a new one in config.json needs no route change
 * (phase-05 Success Criteria). `@RequirePermission()` here is intentionally
 * empty (authenticated-only): the real, per-datasource permission check
 * happens in `DatasourcePermissionGuard`, same pattern as
 * `DatasourcesController` uses for the same reason (permission is derived
 * from `:code`, unknowable statically).
 */
@Controller('query')
//đặt tiền tố route cho controller là 'query', tất cả các endpoint trong controller này sẽ có đường dẫn bắt đầu bằng '/query'.
@RequirePermission()
//đánh dấu rằng tất cả các endpoint trong controller này yêu cầu người dùng phải có quyền truy cập (permission) để thực hiện các hành động. Tuy nhiên, không chỉ định quyền cụ thể nào, vì quyền truy cập sẽ được xác định bởi guard `DatasourcePermissionGuard` dựa trên mã nguồn dữ liệu (datasource code) được cung cấp trong đường dẫn.
@UseGuards(DatasourcePermissionGuard)
//phạm vi và quyền truy cập được xác định bởi các decorator và guard, đảm bảo rằng chỉ những người dùng có quyền thích hợp mới có thể truy cập các endpoint này.
export class QueryController {
  constructor(
    private readonly queryService: QueryService,
    private readonly imageProxyService: ImageProxyService,
  ) {}

  @Post(':code')
  // /api/v1/query/:code
  @HttpCode(HttpStatus.OK)
  @UseGuards(QueryThrottlerGuard)
  @SkipThrottle({ default: true, login: true })
  
  //method xử lí
  // 1. đọc code từ url , kiểm tra body, yêu cầu phải đúng định dạng
  execute(
    @Param('code') code: string,
    // Parameter-scoped pipe (NOT method-level @UsePipes()): a method-level
    // pipe would also run against @Param('code')/@CurrentUser()/@RequestId()
    // (Nest pipes every "pipeable" arg — @Req()/@Res() are the only
    // built-ins excluded), silently mangling them since they don't match
    // queryRequestSchema's shape.
    @Body(new ZodValidationPipe(queryRequestSchema)) body: QueryRequestDto,
    @CurrentUser() user: JwtUser,
    //lấy người dùng hiện tại và rq ID qua decorator
    @RequestId() requestId: string,
    // lấy thông tin request từ express
    @Req() req: Request,
    //gửi vào execute 
  ): Promise<QueryEnvelope> {
    return this.queryService.execute({
      code,
      params: body.params,
      page: body.page,
      pageSize: body.pageSize,
      user,
      requestId,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
  }


  // hai endpoint ảnh
  @Get(':code/image/:recordId')
  async image(
    @Param('code') code: string,
    @Param('recordId') recordId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const metadata = await this.imageProxyService.resolveMetadata(code, recordId);
    await this.imageProxyService.streamTo(code, metadata, res, ifNoneMatch);
  }

  /**
   * Implementation Step 7 seam: for now serves the exact same bytes as the
   * full image (YAGNI — no speculative resize/cache pipeline). A future
   * on-demand thumbnail cache only needs to change `ImageProxyService`.
   */
  @Get(':code/image/:recordId/thumb')
  async thumb(
    @Param('code') code: string,
    @Param('recordId') recordId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const metadata = await this.imageProxyService.resolveMetadata(code, recordId);
    await this.imageProxyService.streamTo(code, metadata, res, ifNoneMatch);
  }
}
