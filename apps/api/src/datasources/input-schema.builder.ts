import { z, type ZodType } from 'zod';
import type { InputFieldDef } from '@app/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

function baseSchemaFor(field: InputFieldDef): ZodType {
  switch (field.type) {
    case 'string': {
      let schema = z.string();
      if (field.minLength !== undefined) schema = schema.min(field.minLength);
      if (field.maxLength !== undefined) schema = schema.max(field.maxLength);
      if (field.pattern) schema = schema.regex(new RegExp(field.pattern));
      return schema;
    }
    case 'number': {
      let schema = z.coerce.number();
      if (field.min !== undefined) schema = schema.min(field.min);
      if (field.max !== undefined) schema = schema.max(field.max);
      return schema;
    }
    case 'boolean':
      return z.boolean();
    case 'date':
      return z.string().regex(DATE_RE, `${field.label} must be YYYY-MM-DD`);
    case 'datetime':
      return z.string().regex(DATETIME_RE, `${field.label} must be an ISO 8601 datetime`);
    case 'enum': {
      const values = (field.options ?? []).map((o) => o.value);
      if (values.length === 0) {
        throw new Error(`Input field "${field.name}" has type "enum" but no options`);
      }
      return z.enum(values as [string, ...string[]]);
    }
    case 'image':
      throw new Error(`Input field "${field.name}": type "image" is output-only, not valid for input.fields`);
    default: {
      const _exhaustive: never = field.type;
      throw new Error(`Unsupported input field type: ${String(_exhaustive)}`);
    }
  }
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Compiles `datasources[].input.fields[]` into a Zod object, built once at
 * boot and cached in the registry (phase-04 Key Insight). `atLeastOneOf`/
 * `requireGroups` cannot be expressed per-field, so they become a
 * `superRefine` on the whole object.
 */
export function buildInputSchema(fields: InputFieldDef[], atLeastOneOf?: string[], requireGroups?: string[][]): ZodType {
  const shape: Record<string, ZodType> = {};
  for (const field of fields) {
    const base = baseSchemaFor(field);
    shape[field.name] = field.required ? base : base.optional();
  }

  let schema: ZodType = z.object(shape).strict();

  if (atLeastOneOf && atLeastOneOf.length > 0) {
    schema = schema.superRefine((data, ctx) => {
      const record = data as Record<string, unknown>;
      const hasAny = atLeastOneOf.some((name) => isPresent(record[name]));
      if (!hasAny) {
        ctx.addIssue({
          code: 'custom',
          message: `At least one of [${atLeastOneOf.join(', ')}] is required`,
          path: atLeastOneOf,
        });
      }
    });
  }

  if (requireGroups && requireGroups.length > 0) {
    schema = schema.superRefine((data, ctx) => {
      const record = data as Record<string, unknown>;
      const anyGroupSatisfied = requireGroups.some((group) => group.every((name) => isPresent(record[name])));
      if (!anyGroupSatisfied) {
        const groupDescriptions = requireGroups.map((group) => `[${group.join(' + ')}]`).join(' HOẶC ');
        ctx.addIssue({
          code: 'custom',
          message: `Cần điền đủ một trong các nhóm: ${groupDescriptions}`,
          path: requireGroups[0],
        });
      }
    });
  }

  return schema;
}
