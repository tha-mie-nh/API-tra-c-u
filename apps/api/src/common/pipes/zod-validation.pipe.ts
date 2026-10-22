import { HttpException, HttpStatus, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Generic runtime validation pipe backed by a Zod schema. Config-driven input
 * fields are dynamic (unknown at compile time), so DTOs are plain Zod schemas
 * built from ordinary JS values instead of class-validator decorator classes
 * (see research/researcher-01 §1). Phase 04 reuses this exact pipe for
 * per-datasource dynamically-built schemas — DRY, one validation mechanism
 * for the whole API.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new HttpException(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: result.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return result.data;
  }
}
