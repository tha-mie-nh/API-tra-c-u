import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, Req, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { FEATURE_PERMISSION_CODES } from '@app/shared';
import { RequirePermission } from '../rbac/permission.decorator';
import { CurrentUser } from '../rbac/current-user.decorator';
import type { JwtUser } from '../rbac/jwt-user.interface';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditAction } from '../audit/audit-action.decorator';
import { UsersService } from './users.service';
import { createUserSchema, type CreateUserDto } from './dto/create-user.dto';
import { updateUserSchema, type UpdateUserDto } from './dto/update-user.dto';
import { setRolesSchema, type SetRolesDto } from './dto/set-roles.dto';
import { listUsersQuerySchema, type ListUsersQueryDto } from './dto/list-users-query.dto';

/** Admin-only user management (spec b). Every mutation is audited via
 * @AuditAction() + the global AuditInterceptor. */
@Controller('admin/users')
@RequirePermission(FEATURE_PERMISSION_CODES.ADMIN_USERS)
@ApiTags('Admin — Users')
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UsePipes(new ZodValidationPipe(listUsersQuerySchema))
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.list(query);
  }

  @Post()
  @AuditAction('user.create', 'user')
  create(@Body(new ZodValidationPipe(createUserSchema)) body: CreateUserDto, @CurrentUser() actor: JwtUser) {
    return this.usersService.create(body, actor.id);
  }

  // Static "password-reset-requests" routes MUST come before `:id` below —
  // NestJS matches routes in declaration order, and `:id` would otherwise
  // swallow "GET /admin/users/password-reset-requests" as id="password-reset-requests".
  @Get('password-reset-requests')
  listPasswordResetRequests() {
    return this.usersService.listPasswordResetRequests();
  }

  @Post('password-reset-requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  @AuditAction('user.password_reset_request.approve', 'password_reset_request')
  approvePasswordResetRequest(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    return this.usersService.approvePasswordResetRequest(id, actor.id);
  }

  @Post('password-reset-requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @AuditAction('user.password_reset_request.reject', 'password_reset_request')
  rejectPasswordResetRequest(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    return this.usersService.rejectPasswordResetRequest(id, actor.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @AuditAction('user.update', 'user')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserDto,
    @CurrentUser() actor: JwtUser,
    @Req() req: Request,
  ) {
    req.auditBefore = await this.usersService.findOne(id);
    return this.usersService.update(id, body, actor.id);
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @AuditAction('user.lock', 'user')
  async lock(@Param('id') id: string, @CurrentUser() actor: JwtUser, @Req() req: Request) {
    req.auditBefore = await this.usersService.findOne(id);
    return this.usersService.lock(id, actor.id);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @AuditAction('user.unlock', 'user')
  async unlock(@Param('id') id: string, @CurrentUser() actor: JwtUser, @Req() req: Request) {
    req.auditBefore = await this.usersService.findOne(id);
    return this.usersService.unlock(id, actor.id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @AuditAction('user.reset_password', 'user')
  resetPassword(@Param('id') id: string, @CurrentUser() actor: JwtUser) {
    return this.usersService.resetPassword(id, actor.id);
  }

  @Put(':id/roles')
  @HttpCode(HttpStatus.OK)
  @AuditAction('user.set_roles', 'user')
  setRoles(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setRolesSchema)) body: SetRolesDto,
    @CurrentUser() actor: JwtUser,
  ) {
    return this.usersService.setRoles(id, body.roleIds, actor.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @AuditAction('user.delete', 'user')
  async delete(@Param('id') id: string, @CurrentUser() actor: JwtUser, @Req() req: Request) {
    req.auditBefore = await this.usersService.findOne(id);
    return this.usersService.delete(id, actor.id);
  }
}
