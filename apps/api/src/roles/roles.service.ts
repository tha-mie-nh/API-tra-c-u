import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionKind, type Permission, type Role, type RolePermission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import type { CreateRoleDto } from './dto/create-role.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';

type RoleWithOptionalPermissions = Role & { rolePermissions?: (RolePermission & { permission: Permission })[] };

/** Projects `rolePermissions.permission.code` onto a flat `permissionCodes`
 * array (Phase 08 PermissionMatrix needs the CURRENT set to pre-check boxes —
 * `PUT /admin/roles/:id/permissions` is a full replace, so an unknown current
 * state would risk silently revoking grants on save). Additive-only: omitted
 * when the caller didn't eager-load `rolePermissions.permission`. */
function toPublicRole(role: RoleWithOptionalPermissions) {
  const { rolePermissions, ...rest } = role;
  return {
    ...rest,
    ...(rolePermissions ? { permissionCodes: rolePermissions.map((rp) => rp.permission.code) } : {}),
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly datasourceRegistry: DatasourceRegistryService,
  ) {}

  async list() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { rolePermissions: { include: { permission: true } } },
    });
    return roles.map(toPublicRole);
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Role not found' });
    return toPublicRole(role);
  }

  async create(dto: CreateRoleDto) {
    const exists = await this.prisma.role.findUnique({ where: { code: dto.code } });
    if (exists) throw new ConflictException({ code: 'ROLE_CODE_TAKEN', message: 'Role code already exists' });
    return this.prisma.role.create({
      data: { code: dto.code, name: dto.name, description: dto.description ?? null },
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    await this.findOne(id);
    return this.prisma.role.update({ where: { id }, data: { name: dto.name, description: dto.description } });
  }

  async remove(id: string): Promise<{ id: string }> {
    const role = await this.findOne(id);
    if (role.isSystem) {
      throw new BadRequestException({ code: 'SYSTEM_ROLE_PROTECTED', message: 'Cannot delete a system role' });
    }
    await this.prisma.role.delete({ where: { id } });
    return { id };
  }

  async setPermissions(id: string, permissionCodes: string[]): Promise<{ id: string; permissionCodes: string[] }> {
    await this.findOne(id);
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    if (permissions.length !== permissionCodes.length) {
      throw new BadRequestException({
        code: 'UNKNOWN_PERMISSION_CODE',
        message: 'One or more permission codes do not exist',
      });
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: id, permissionId: permission.id })),
      }),
    ]);
    return { id, permissionCodes };
  }

  /** Full permission catalog, incl. `api:*` codes auto-synced by Phase 04. */
  /**
   * Review feedback: the role permission matrix showed `api:*` codes for
   * datasources that had since been disabled in config.json (never
   * hard-deleted from the DB — see `PermissionSyncService`'s doc comment —
   * to avoid orphaning `role_permissions` and losing audit meaning), making
   * the list look padded with dead entries an admin could still tick.
   * Filtering them out here is display-only: the DB rows (and any existing
   * role grants on them) are untouched, so re-enabling a datasource later
   * needs no permission re-sync.
   */
  async listPermissions() {
    const enabledApiCodes = new Set(
      this.datasourceRegistry
        .getAll()
        .filter((ds) => ds.enabled)
        .map((ds) => ds.permissionCode),
    );
    const permissions = await this.prisma.permission.findMany({ orderBy: [{ kind: 'asc' }, { code: 'asc' }] });
    return permissions.filter((p) => p.kind !== PermissionKind.API || enabledApiCodes.has(p.code));
  }
}
