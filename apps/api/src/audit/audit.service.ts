import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SECRET_KEY_PATTERN = /password|token|secret/i;

export interface RecordAuditInput {
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/** Recursively redacts any object key matching /password|token|secret/i, so
 * a password hash, a one-time temp password, or a refresh token can never
 * land in `audit_logs` (phase-03 Security Considerations + success criteria). */
function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : stripSecrets(val);
    }
    return out;
  }
  return value;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          before: stripSecrets(input.before) as Prisma.InputJsonValue,
          after: stripSecrets(input.after) as Prisma.InputJsonValue,
          ip: input.ip ?? null,
        },
      });
    } catch (err) {
      // Audit logging must never break the admin mutation that already
      // succeeded — log and move on.
      this.logger.error(`Failed to write audit log for action "${input.action}"`, err as Error);
    }
  }
}
