import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { FEATURE_PERMISSION_CODES } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermission } from '../rbac/permission.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

const listAuditLogsSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  actorUserId: z.string().uuid().optional(),
  targetType: z.string().optional(),
});
type ListAuditLogsQuery = z.infer<typeof listAuditLogsSchema>;

/** GET /admin/audit-logs — filterable admin-action log (spec g, reference-api-specification.md). */
@Controller('admin/audit-logs')
@RequirePermission(FEATURE_PERMISSION_CODES.ADMIN_AUDIT)
@ApiTags('Admin — Audit log')
@ApiBearerAuth('access-token')
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UsePipes(new ZodValidationPipe(listAuditLogsSchema))
  async list(@Query() query: ListAuditLogsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }
}
