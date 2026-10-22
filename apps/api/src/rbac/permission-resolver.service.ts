import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolves a user's effective permission codes: userId -> user_roles ->
 * role_permissions -> permissions. Deliberately NOT cached across requests
 * (only within a single request's lifecycle, via PermissionGuard stashing
 * the result on `request.user.permissions`) — a permission/role change must
 * take effect on the user's very next request, not after some TTL.
 */
@Injectable()
export class PermissionResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissions(userId: string): Promise<Set<string>> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            rolePermissions: {
              select: { permission: { select: { code: true } } },
            },
          },
        },
      },
    });

    const codes = new Set<string>();
    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        codes.add(rolePermission.permission.code);
      }
    }
    return codes;
  }
}
