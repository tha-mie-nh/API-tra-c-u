import { z, type ZodTypeAny } from 'zod';
import type { InputFieldDef } from '@shared/index';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * Field-by-field mirror of `apps/api/src/datasources/input-schema.builder.ts`
 * (required, minLength/maxLength, min/max, pattern, enum, atLeastOneOf) —
 * client-side validation is UX only, the backend re-validates and is
 * authoritative (phase-07 Key Insights). Keep both rule sets side by side so
 * drift between them is visible in review.
 */
function baseSchemaFor(field: InputFieldDef): ZodTypeAny {
  switch (field.type) {
    case 'string': {
      let schema = z.string();
      if (field.minLength !== undefined) {
        schema = schema.min(field.minLength, `${field.label} phải có ít nhất ${field.minLength} ký tự`);
      }
      if (field.maxLength !== undefined) {
        schema = schema.max(field.maxLength, `${field.label} không được quá ${field.maxLength} ký tự`);
      }
      if (field.pattern) {
        schema = schema.regex(new RegExp(field.pattern), `${field.label} không đúng định dạng`);
      }
      return schema;
    }
    case 'number': {
      let schema = z.coerce.number();
      if (field.min !== undefined) schema = schema.min(field.min, `${field.label} phải lớn hơn hoặc bằng ${field.min}`);
      if (field.max !== undefined) schema = schema.max(field.max, `${field.label} phải nhỏ hơn hoặc bằng ${field.max}`);
      return schema;
    }
    case 'boolean':
      return z.boolean();
    case 'date':
      return z.string().regex(DATE_RE, `${field.label} phải theo định dạng YYYY-MM-DD`);
    case 'datetime':
      return z.string().regex(DATETIME_RE, `${field.label} phải là ngày giờ hợp lệ`);
    case 'enum': {
      const values = (field.options ?? []).map((option) => option.value);
      if (values.length === 0) return z.string();
      return z.enum(values as [string, ...string[]]);
    }
    default:
      // Unknown field type: degrade to a permissive text field instead of
      // crashing the page (field-registry.tsx mirrors this same fallback).
      return z.string();
  }
}

/**
 * `''`/`null`/`undefined` all mean "not provided". Every field is built this
 * way (optional at the type level) and required-ness is enforced once, in
 * the object-level `superRefine` below — so a blank OPTIONAL field never
 * trips its own min/pattern/coerce validator, and a blank REQUIRED field
 * always gets one consistent, friendly Vietnamese message instead of a raw
 * zod type-mismatch error.
 */
function fieldSchema(field: InputFieldDef): ZodTypeAny {
  return z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    baseSchemaFor(field).optional(),
  );
}

/** Builds one `ZodObject` for a datasource's `input.fields[]` + `atLeastOneOf`
 * + `requireGroups` — used by `DynamicSearchForm` via `zodResolver`. */
export function buildZodSchema(fields: InputFieldDef[], atLeastOneOf?: string[], requireGroups?: string[][]) {
  const shape: Record<string, ZodTypeAny> = {};
  for (const field of fields) shape[field.name] = fieldSchema(field);
  const labelByName = new Map(fields.map((field) => [field.name, field.label]));

  return z.object(shape).superRefine((data, ctx) => {
    const record = data as Record<string, unknown>;

    for (const field of fields) {
      if (field.required && record[field.name] === undefined) {
        ctx.addIssue({ code: 'custom', path: [field.name], message: `${field.label} là bắt buộc` });
      }
    }

    if (atLeastOneOf && atLeastOneOf.length > 0) {
      const hasAny = atLeastOneOf.some((name) => record[name] !== undefined);
      if (!hasAny) {
        const [firstField] = atLeastOneOf;
        if (firstField) {
          ctx.addIssue({
            code: 'custom',
            path: [firstField],
            message: `Vui lòng nhập ít nhất một trong các trường: ${atLeastOneOf.join(', ')}`,
          });
        }
      }
    }

    if (requireGroups && requireGroups.length > 0) {
      const anyGroupSatisfied = requireGroups.some((group) => group.every((name) => record[name] !== undefined));
      if (!anyGroupSatisfied) {
        const groupDescriptions = requireGroups
          .map((group) => group.map((name) => labelByName.get(name) ?? name).join(' + '))
          .join(' HOẶC ');
        const [firstField] = requireGroups[0] ?? [];
        if (firstField) {
          ctx.addIssue({
            code: 'custom',
            path: [firstField],
            message: `Vui lòng điền đủ một trong các nhóm: ${groupDescriptions}`,
          });
        }
      }
    }
  });
}
