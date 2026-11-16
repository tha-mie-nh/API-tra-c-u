import { Body, Controller, Delete, Get, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { FEATURE_PERMISSION_CODES } from '@app/shared';
import { RequirePermission } from '../rbac/permission.decorator';
import { AuditAction } from '../audit/audit-action.decorator';
import { AdminDatasourcesService } from './admin-datasources.service';

/**
 * `/admin/dictionaries` — ADMIN-only CRUD for the named code -> label lists in
 * `config.json` (`dictionaries`), referenced by datasource fields through
 * `optionsRef` / `valueMapRef`. Uses the same locked, validated, atomically
 * written reload path as datasource edits, so a change is live without restart.
 */
@Controller('admin/dictionaries')
@RequirePermission(FEATURE_PERMISSION_CODES.ADMIN_DATASOURCES)
@ApiTags('Admin — Dictionaries')
@ApiBearerAuth('access-token')
export class AdminDictionariesController {
  constructor(private readonly service: AdminDatasourcesService) {}

  @Get()
  list() {
    return this.service.listDictionaries();
  }

  /** Create or replace dictionary `:name` with body `{ items: [{ value, label }] }`. */
  @Put(':name')
  @AuditAction('dictionary.upsert', 'dictionary', { targetParam: 'name' })
  upsert(@Param('name') name: string, @Body() body: { items?: unknown }, @Req() req: Request) {
    req.auditBefore = this.service.listDictionaries().find((d) => d.name === name);
    return this.service.putDictionary(name, body?.items);
  }

  @Delete(':name')
  @AuditAction('dictionary.delete', 'dictionary', { targetParam: 'name' })
  remove(@Param('name') name: string, @Req() req: Request) {
    req.auditBefore = this.service.listDictionaries().find((d) => d.name === name);
    return this.service.removeDictionary(name);
  }
}
