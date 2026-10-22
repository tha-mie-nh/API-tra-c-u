import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FEATURE_PERMISSION_CODES } from '@app/shared';
import { RequirePermission } from '../rbac/permission.decorator';
import { RolesService } from './roles.service';

/** GET /admin/permissions — full permission catalog (feature + api:* codes). */
@Controller('admin/permissions')
@RequirePermission(FEATURE_PERMISSION_CODES.ADMIN_ROLES)
@ApiTags('Admin — Roles & permissions')
@ApiBearerAuth('access-token')
export class PermissionsController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  list() {
    return this.rolesService.listPermissions();
  }
}
