import { z } from 'zod';
import { vi } from '@/i18n/vi';
import {
  inputFieldRowSchema,
  makeEmptyInputFieldRow,
  makeEmptyOutputFieldRow,
  outputFieldRowSchema,
} from './datasource-field-row-types';

/** Identifier check for a field's `name` (client-side only — structural/
 * cross-field correctness, incl. uniqueness, is still verified server-side
 * on submit, same as every other field here). */
const FIELD_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Follow-up to phase-03: `input`/`output` are no longer raw JSON textareas —
 * each field of `config.schema.json`'s `inputField`/`outputField` DSL now has
 * its own structured row (`datasource-field-row-types.ts`). The backend's
 * AJV `config.schema.json` + `config-cross-field-validator.ts` remain the
 * single source of truth for structural/cross-field correctness; this
 * schema only checks non-empty required text + valid identifiers for `name`.
 * Still mirrors the rest of `DatasourceEntry` as before: identity/meta,
 * `transport`, `limits`.
 */
export const datasourceFormSchema = z
  .object({
    code: z
      .string()
      .min(1, vi.admin.datasources.codeRequired)
      .regex(/^[A-Z][A-Z0-9_]*$/, vi.admin.datasources.codeRequired),
    name: z.string().min(1, vi.admin.datasources.nameRequired),
    description: z.string().optional(),
    type: z.enum(['info', 'image']),
    enabled: z.boolean(),
    transportKind: z.enum(['mock', 'http']),
    mockDataFile: z.string().optional(),
    httpBaseUrl: z.string().optional(),
    httpPath: z.string().optional(),
    httpMethod: z.enum(['GET', 'POST']).optional(),
    httpTimeoutMs: z.string().optional(),
    headers: z.array(z.object({ key: z.string(), value: z.string() })),
    authKind: z.enum(['none', 'apiKeyHeader', 'bearer', 'basic']),
    authHeader: z.string().optional(),
    authValueEnv: z.string().optional(),
    maxResults: z.string().optional(),
    pageSize: z.string().optional(),
    inputFields: z.array(inputFieldRowSchema).min(1, vi.admin.datasources.atLeastOneFieldRequired),
    inputAtLeastOneOf: z.array(z.string()),
    inputRequireGroups: z.array(z.array(z.string())),
    outputFields: z.array(outputFieldRowSchema).min(1, vi.admin.datasources.atLeastOneFieldRequired),
    outputTimestampField: z.string(),
    outputIdentityField: z.string(),
    outputSortOrder: z.enum(['asc', 'desc']),
    outputRecordsPath: z.string().optional(),
    outputTotalPath: z.string().optional(),
    outputRequestIdPath: z.string().optional(),
    outputImageRefEnabled: z.boolean(),
    outputImageRefBucketField: z.string().optional(),
    outputImageRefObjectKeyField: z.string().optional(),
    outputImageRefMimeField: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const t = vi.admin.datasources;
    if (values.transportKind === 'mock' && !values.mockDataFile?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['mockDataFile'], message: t.dataFileRequired });
    }
    if (values.transportKind === 'http') {
      if (!values.httpBaseUrl?.trim()) ctx.addIssue({ code: 'custom', path: ['httpBaseUrl'], message: t.baseUrlRequired });
      if (!values.httpPath?.trim()) ctx.addIssue({ code: 'custom', path: ['httpPath'], message: t.pathRequired });
    }
    if (Boolean(values.maxResults?.trim()) !== Boolean(values.pageSize?.trim())) {
      ctx.addIssue({ code: 'custom', path: ['pageSize'], message: t.limitsBothRequired });
    }

    values.inputFields.forEach((row, i) => {
      if (!row.name.trim()) ctx.addIssue({ code: 'custom', path: ['inputFields', i, 'name'], message: t.fieldNameRequired });
      else if (!FIELD_NAME_RE.test(row.name.trim())) {
        ctx.addIssue({ code: 'custom', path: ['inputFields', i, 'name'], message: t.fieldNameInvalid });
      }
      if (!row.label.trim()) ctx.addIssue({ code: 'custom', path: ['inputFields', i, 'label'], message: t.fieldLabelRequired });
    });
    values.outputFields.forEach((row, i) => {
      if (!row.name.trim()) ctx.addIssue({ code: 'custom', path: ['outputFields', i, 'name'], message: t.fieldNameRequired });
      else if (!FIELD_NAME_RE.test(row.name.trim())) {
        ctx.addIssue({ code: 'custom', path: ['outputFields', i, 'name'], message: t.fieldNameInvalid });
      }
      if (!row.label.trim()) ctx.addIssue({ code: 'custom', path: ['outputFields', i, 'label'], message: t.fieldLabelRequired });
    });
    if (!values.outputTimestampField.trim()) {
      ctx.addIssue({ code: 'custom', path: ['outputTimestampField'], message: t.timestampFieldRequired });
    }
    if (!values.outputIdentityField.trim()) {
      ctx.addIssue({ code: 'custom', path: ['outputIdentityField'], message: t.identityFieldRequired });
    }
    if (values.outputImageRefEnabled) {
      if (!values.outputImageRefBucketField?.trim() || !values.outputImageRefObjectKeyField?.trim() || !values.outputImageRefMimeField?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['outputImageRefMimeField'], message: t.imageRefAllFieldsRequired });
      }
    }
  });

export type DatasourceFormValues = z.infer<typeof datasourceFormSchema>;

export const EMPTY_DATASOURCE_FORM_VALUES: DatasourceFormValues = {
  code: '',
  name: '',
  description: '',
  type: 'info',
  enabled: false,
  transportKind: 'http',
  mockDataFile: '',
  httpBaseUrl: '',
  httpPath: '',
  httpMethod: 'GET',
  httpTimeoutMs: '',
  headers: [],
  authKind: 'none',
  authHeader: '',
  authValueEnv: '',
  maxResults: '',
  pageSize: '',
  inputFields: [makeEmptyInputFieldRow()],
  inputAtLeastOneOf: [],
  inputRequireGroups: [],
  outputFields: [makeEmptyOutputFieldRow()],
  outputTimestampField: '',
  outputIdentityField: '',
  outputSortOrder: 'desc',
  outputRecordsPath: '',
  outputTotalPath: '',
  outputRequestIdPath: '',
  outputImageRefEnabled: false,
  outputImageRefBucketField: '',
  outputImageRefObjectKeyField: '',
  outputImageRefMimeField: '',
};
