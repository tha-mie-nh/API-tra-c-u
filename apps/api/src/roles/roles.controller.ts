import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Req, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { FEATURE_PERMISSION_CODES } from '@app/shared';
import { RequirePermission } from '../rbac/permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditAction } from '../audit/audit-action.decorator';
import { RolesService } from './roles.service';
import { createRoleSchema, type CreateRoleDto } from './dto/create-role.dto';
import { updateRoleSchema, type UpdateRoleDto } from './dto/update-role.dto';
import { setPermissionsSchema, type SetPermissionsDto } from './dto/set-permissions.dto';

/** Admin-only role CRUD + permission assignment (spec c). Every mutation is
 * audited via @AuditAction() + the global AuditInterceptor. */
@Controller('admin/roles')
@RequirePermission(FEATURE_PERMISSION_CODES.ADMIN_ROLES)
@ApiTags('Admin — Roles & permissions')
@ApiBearerAuth('access-token')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  list() {
    return this.rolesService.list();
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createRoleSchema))
  @AuditAction('role.create', 'role')
  create(@Body() body: CreateRoleDto) {
    return this.rolesService.create(body);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  @AuditAction('role.update', 'role')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleDto,
    @Req() req: Request,
  ) {
    req.auditBefore = await this.rolesService.findOne(id);
    return this.rolesService.update(id, body);
  }

  @Delete(':id')
  @AuditAction('role.delete', 'role')
  async remove(@Param('id') id: string, @Req() req: Request) {
    req.auditBefore = await this.rolesService.findOne(id);
    return this.rolesService.remove(id);
  }

  @Put(':id/permissions')
  @HttpCode(HttpStatus.OK)
  @AuditAction('role.set_permissions', 'role')
  async setPermissions(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setPermissionsSchema)) body: SetPermissionsDto,
    @Req() req: Request,
  ) {
    req.auditBefore = await this.rolesService.findOne(id);
    return this.rolesService.setPermissions(id, body.permissionCodes);
  }
}
