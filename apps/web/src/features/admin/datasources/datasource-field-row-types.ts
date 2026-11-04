import { z } from 'zod';

/**
 * Row shapes for the visual input/output field builder (follow-up to
 * phase-03: replaces the raw-JSON `input`/`output` textareas). Mirrors
 * `config/config.schema.json`'s `$defs.inputField`/`outputField`/
 * `fieldOption` 1:1 — every optional schema property gets a form field so
 * the structured editor can express the FULL DSL, no JSON escape hatch
 * needed (the schema is `additionalProperties: false`, so there is no
 * "rest" left to put in one). Numbers/booleans are kept as strings in the
 * row (consistent with `maxResults`/`pageSize` elsewhere in this form) and
 * parsed back in `datasource-field-row-converters.ts`.
 */
export const FIELD_TYPE_VALUES = ['string', 'number', 'date', 'datetime', 'enum', 'boolean', 'image'] as const;

export const fieldOptionRowSchema = z.object({ value: z.string(), label: z.string() });
export type FieldOptionRow = z.infer<typeof fieldOptionRowSchema>;
export const makeEmptyFieldOptionRow = (): FieldOptionRow => ({ value: '', label: '' });

/** Shared by `outputField.valueMap` and `outputField.iconMap`. */
export const keyValueRowSchema = z.object({ key: z.string(), value: z.string() });
export type KeyValueRow = z.infer<typeof keyValueRowSchema>;
export const makeEmptyKeyValueRow = (): KeyValueRow => ({ key: '', value: '' });

export const inputFieldRowSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(FIELD_TYPE_VALUES),
  required: z.boolean(),
  minLength: z.string(),
  maxLength: z.string(),
  min: z.string(),
  max: z.string(),
  pattern: z.string(),
  format: z.string(),
  mapTo: z.string(),
  options: z.array(fieldOptionRowSchema),
});
export type InputFieldRow = z.infer<typeof inputFieldRowSchema>;
export const makeEmptyInputFieldRow = (): InputFieldRow => ({
  name: '',
  label: '',
  type: 'string',
  required: false,
  minLength: '',
  maxLength: '',
  min: '',
  max: '',
  pattern: '',
  format: '',
  mapTo: '',
  options: [],
});

export const outputFieldRowSchema = z.object({
  name: z.string(),
  label: z.string(),
  from: z.string(),
  type: z.enum(FIELD_TYPE_VALUES),
  valueMap: z.array(keyValueRowSchema),
  iconMap: z.array(keyValueRowSchema),
  sensitive: z.boolean(),
  internal: z.boolean(),
  emphasize: z.boolean(),
  headerField: z.boolean(),
});
export type OutputFieldRow = z.infer<typeof outputFieldRowSchema>;
export const makeEmptyOutputFieldRow = (): OutputFieldRow => ({
  name: '',
  label: '',
  from: '',
  type: 'string',
  valueMap: [],
  iconMap: [],
  sensitive: false,
  internal: false,
  emphasize: false,
  headerField: false,
});
