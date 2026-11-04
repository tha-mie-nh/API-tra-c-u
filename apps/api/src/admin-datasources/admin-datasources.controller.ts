import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { FEATURE_PERMISSION_CODES } from '@app/shared';
import { RequirePermission } from '../rbac/permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditAction } from '../audit/audit-action.decorator';
import { AdminDatasourcesService } from './admin-datasources.service';
import { setDatasourceEnabledSchema, type SetDatasourceEnabledDto } from './dto/set-datasource-enabled.dto';

/**
 * `/admin/datasources` — ADMIN-only CRUD + enable/disable + reload-from-disk
 * for `config.json` (phase-02 Requirements). Mirrors `RolesController`'s
 * shape (class-level `@RequirePermission`, `@AuditAction` + `req.auditBefore`
 * set right before mutating, picked up by the global `AuditInterceptor`).
 * Bodies are accepted as `unknown` — the AJV `config.schema.json` (via
 * `AdminDatasourcesService.create/update`) is the single source of truth for
 * entry shape, not a parallel Zod/class-validator DTO.
 */
@Controller('admin/datasources')
@RequirePermission(FEATURE_PERMISSION_CODES.ADMIN_DATASOURCES)
@ApiTags('Admin — Datasources')
@ApiBearerAuth('access-token')
export class AdminDatasourcesController {
  constructor(private readonly service: AdminDatasourcesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get('env-refs')
  envRefs() {
    return this.service.envRefs();
  }

  @Get(':code')
  getOne(@Param('code') code: string) {
    return this.service.get(code);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @AuditAction('datasource.create', 'datasource')
  create(@Body() body: unknown) {
    return this.service.create(body);
  }

  @Put(':code')
  @AuditAction('datasource.update', 'datasource')
  update(@Param('code') code: string, @Body() body: unknown, @Req() req: Request) {
    req.auditBefore = this.service.get(code);
    return this.service.update(code, body);
  }

  @Patch(':code/enabled')
  @AuditAction('datasource.toggle', 'datasource')
  setEnabled(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(setDatasourceEnabledSchema)) body: SetDatasourceEnabledDto,
    @Req() req: Request,
  ) {
    req.auditBefore = this.service.get(code);
    return this.service.setEnabled(code, body.enabled);
  }

  @Delete(':code')
  @AuditAction('datasource.delete', 'datasource')
  remove(@Param('code') code: string, @Req() req: Request) {
    req.auditBefore = this.service.get(code);
    return this.service.remove(code);
  }

  /** No payload — re-reads `config.json` off disk and reloads (plan.md
   * Resolved #4, cheap escape hatch for hand edits). */
  @Post('reload')
  @AuditAction('datasource.reload', 'datasource')
  reload() {
    return this.service.reloadFromDisk();
  }
}
