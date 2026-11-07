import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { generateTempPassword } from './temp-password.util';
import { toPublicUser, type PublicUser } from './user-view.util';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { ListUsersQueryDto } from './dto/list-users-query.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async list(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.UserWhereInput = query.search
      ? {
          OR: [
            { username: { contains: query.search, mode: 'insensitive' } },
            { fullName: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { userRoles: { include: { role: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: items.map(toPublicUser), total, page, pageSize };
  }

  async findOne(id: string): Promise<PublicUser> {
    return toPublicUser(await this.findOneRaw(id));
  }

  private async findOneRaw(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    return user;
  }

  async create(dto: CreateUserDto, actorId: string): Promise<{ user: PublicUser; tempPassword: string }> {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new ConflictException({ code: 'USERNAME_TAKEN', message: 'Username already exists' });

    const tempPassword = generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        fullName: dto.fullName,
        email: dto.email ?? null,
        passwordHash,
        mustChangePassword: true,
        createdBy: actorId,
      },
    });

    if (dto.roleIds?.length) {
      await this.replaceRoles(user.id, dto.roleIds, actorId);
    }

    return { user: toPublicUser(user), tempPassword };
  }

  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<PublicUser> {
    await this.findOneRaw(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { fullName: dto.fullName, email: dto.email, updatedBy: actorId },
    });
    return toPublicUser(user);
  }

  async lock(id: string, actorId: string): Promise<PublicUser> {
    // Self-lock guard: without this, an ADMIN clicking "lock" on their own
    // row (e.g. while testing the feature) revokes their own session
    // immediately (see below) with no other admin left to undo it — this
    // exact scenario happened in prod and required a direct DB fix to
    // recover, hence the hard block here rather than just a UI hint.
    if (id === actorId) {
      throw new ConflictException({
        code: 'CANNOT_LOCK_SELF',
        message: 'Không thể tự khóa tài khoản đang đăng nhập của chính mình',
      });
    }

    const target = await this.findOneRaw(id);

    // Last-active-ADMIN guard: locking the only remaining active ADMIN
    // account would leave nobody able to unlock anyone (including
    // themselves) through the UI — same failure mode as the self-lock case
    // above, just via a second admin account instead of one's own.
    const isTargetAdmin = target.userRoles.some((ur) => ur.role.code === 'ADMIN');
    if (isTargetAdmin) {
      const activeAdminCount = await this.prisma.user.count({
        where: { status: UserStatus.ACTIVE, userRoles: { some: { role: { code: 'ADMIN' } } } },
      });
      if (activeAdminCount <= 1) {
        throw new ConflictException({
          code: 'LAST_ACTIVE_ADMIN',
          message: 'Không thể khóa tài khoản ADMIN đang hoạt động cuối cùng trong hệ thống',
        });
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.LOCKED, updatedBy: actorId },
    });
    // Admin lock propagation: kill every active session immediately, not
    // just at the next natural refresh-cookie check.
    await this.tokenService.revokeAllForUser(id);
    return toPublicUser(user);
  }

  async unlock(id: string, actorId: string): Promise<PublicUser> {
    await this.findOneRaw(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.ACTIVE, lockedUntil: null, failedLoginCount: 0, updatedBy: actorId },
    });
    return toPublicUser(user);
  }

  async resetPassword(id: string, actorId: string): Promise<{ tempPassword: string }> {
    await this.findOneRaw(id);
    const tempPassword = generateTempPassword();
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true, updatedBy: actorId },
    });
    await this.tokenService.revokeAllForUser(id);
    return { tempPassword };
  }

  async setRoles(id: string, roleIds: string[], actorId: string): Promise<{ id: string; roleIds: string[] }> {
    // Self-guard: same reasoning as lock()'s self-guard below — an ADMIN
    // removing their OWN Administrator role (or any role) locks themselves
    // out of admin screens with no other action to undo it from the UI.
    // Hard block rather than relying on the "would this leave 0 active
    // admins" check alone, since self-demotion is a mistake regardless of
    // whether other admins exist.
    if (id === actorId) {
      throw new ConflictException({
        code: 'CANNOT_MODIFY_OWN_ROLES',
        message: 'Không thể tự thay đổi vai trò của chính tài khoản đang đăng nhập',
      });
    }

    const target = await this.findOneRaw(id);

    // Last-active-ADMIN guard: mirrors lock()'s — removing ADMIN from the
    // only other active admin account would leave nobody able to manage
    // roles/users at all.
    const isTargetAdmin = target.userRoles.some((ur) => ur.role.code === 'ADMIN');
    const keepsAdmin = await this.prisma.role.findFirst({ where: { id: { in: roleIds }, code: 'ADMIN' } });
    if (isTargetAdmin && !keepsAdmin) {
      const activeAdminCount = await this.prisma.user.count({
        where: { status: UserStatus.ACTIVE, userRoles: { some: { role: { code: 'ADMIN' } } } },
      });
      if (activeAdminCount <= 1) {
        throw new ConflictException({
          code: 'LAST_ACTIVE_ADMIN',
          message: 'Không thể bỏ vai trò Quản trị viên của tài khoản ADMIN đang hoạt động cuối cùng trong hệ thống',
        });
      }
    }

    await this.replaceRoles(id, roleIds, actorId);
    return { id, roleIds };
  }

  async delete(id: string, actorId: string): Promise<PublicUser> {
    // Same self-guard as lock()/setRoles() — never let an admin remove
    // their own account out from under themselves mid-session.
    if (id === actorId) {
      throw new ConflictException({
        code: 'CANNOT_DELETE_SELF',
        message: 'Không thể tự xóa tài khoản đang đăng nhập của chính mình',
      });
    }

    const target = await this.findOneRaw(id);

    // ADMIN accounts are never deletable through this action (blanket
    // rule, not just "the last one") — demote via "Gán vai trò" first if
    // the account genuinely needs removing.
    const isTargetAdmin = target.userRoles.some((ur) => ur.role.code === 'ADMIN');
    if (isTargetAdmin) {
      throw new ConflictException({
        code: 'CANNOT_DELETE_ADMIN',
        message: 'Không thể xóa tài khoản có vai trò Quản trị viên — bỏ vai trò Quản trị viên trước nếu thực sự cần xóa',
      });
    }

    // Soft-delete: set DISABLED (an existing, already-login-blocked status —
    // see auth.service.ts — just never settable from the UI until now)
    // instead of a hard DELETE FROM users. A hard delete would either
    // violate the FK from query_logs/audit_logs/user_roles (RESTRICT, no
    // cascade configured — see schema.prisma) for any user with real
    // history, or require cascading those away and losing the audit trail
    // this app otherwise never discards (same reasoning as permissions
    // being "kept, never hard-deleted" in PermissionSyncService).
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.DISABLED, updatedBy: actorId },
    });
    await this.tokenService.revokeAllForUser(id);
    return toPublicUser(user);
  }

  private async replaceRoles(userId: string, roleIds: string[], grantedBy: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId } }),
      this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId, roleId, grantedBy })),
      }),
    ]);
  }

  /** Pending-first (`requestedAt` desc) so the admin UI's "needs action" list stays on top. */
  async listPasswordResetRequests() {
    const items = await this.prisma.passwordResetRequest.findMany({
      orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
      take: 100,
    });
    return items.map((r) => ({
      id: r.id,
      userId: r.userId,
      username: r.usernameSnapshot,
      status: r.status,
      requestedAt: r.requestedAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    }));
  }

  private async findPendingRequestOrThrow(id: string) {
    const request = await this.prisma.passwordResetRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Password reset request not found' });
    if (request.status !== 'PENDING') {
      throw new ConflictException({ code: 'ALREADY_RESOLVED', message: 'Request was already resolved' });
    }
    return request;
  }

  /** Approve = re-use the existing admin reset-password flow (temp password, forced change, session revoke). */
  async approvePasswordResetRequest(id: string, actorId: string): Promise<{ username: string; tempPassword: string }> {
    const request = await this.findPendingRequestOrThrow(id);
    const { tempPassword } = await this.resetPassword(request.userId, actorId);
    await this.prisma.passwordResetRequest.update({
      where: { id },
      data: { status: 'APPROVED', resolvedAt: new Date(), resolvedBy: actorId },
    });
    return { username: request.usernameSnapshot, tempPassword };
  }

  async rejectPasswordResetRequest(id: string, actorId: string): Promise<{ id: string }> {
    await this.findPendingRequestOrThrow(id);
    await this.prisma.passwordResetRequest.update({
      where: { id },
      data: { status: 'REJECTED', resolvedAt: new Date(), resolvedBy: actorId },
    });
    return { id };
  }
}
