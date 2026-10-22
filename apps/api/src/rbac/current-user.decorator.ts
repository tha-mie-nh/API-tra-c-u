import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtUser } from './jwt-user.interface';

/** Extracts `request.user` (set by JwtStrategy/PermissionGuard) into a handler param. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
