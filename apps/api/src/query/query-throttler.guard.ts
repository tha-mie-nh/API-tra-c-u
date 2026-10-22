import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Per-user (not per-IP) query rate limit (phase-05 Implementation Step 5 /
 * Non-functional requirement) — protects the upstream APIs from a runaway
 * client. Falls back to IP when unauthenticated (should not normally
 * happen: this guard only ever runs after JwtAuthGuard).
 */
@Injectable()
export class QueryThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    return req.user?.id ?? req.ip ?? 'unknown';
  }
}
