import type { AdminDatasource, DatasourceInput, DatasourceLimits, DatasourceOutput, TransportAuth, TransportConfig } from '@shared/index';
import { EMPTY_DATASOURCE_FORM_VALUES, type DatasourceFormValues } from './datasource-form-schema';
import { inputFieldToRow, outputFieldToRow, rowToInputField, rowToOutputField } from './datasource-field-row-converters';
import { makeEmptyInputFieldRow, makeEmptyOutputFieldRow } from './datasource-field-row-types';

function headersToRows(headers?: Record<string, string>): { key: string; value: string }[] {
  return Object.entries(headers ?? {}).map(([key, value]) => ({ key, value }));
}

function rowsToHeaders(rows: { key: string; value: string }[]): Record<string, string> | undefined {
  const entries = rows.filter((r) => r.key.trim().length > 0);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map((r) => [r.key.trim(), r.value]));
}

/** `AdminDatasource` (API response) -> form values, for edit/copy-from prefill. */
export function entryToFormValues(entry: AdminDatasource): DatasourceFormValues {
  const transport = entry.transport as TransportConfig;
  const isHttp = transport.kind === 'http';
  const isMock = transport.kind === 'mock';
  const auth = isHttp ? transport.auth : undefined;
  const input = entry.input as DatasourceInput;
  const output = entry.output as DatasourceOutput;

  return {
    ...EMPTY_DATASOURCE_FORM_VALUES,
    code: entry.code,
    name: entry.name,
    description: entry.description ?? '',
    type: entry.type,
    enabled: entry.enabled,
    transportKind: isMock ? 'mock' : 'http',
    mockDataFile: isMock ? transport.dataFile : '',
    httpBaseUrl: isHttp ? transport.baseUrl : '',
    httpPath: isHttp ? transport.path : '',
    httpMethod: isHttp ? transport.method : 'GET',
    httpTimeoutMs: isHttp && transport.timeoutMs !== undefined ? String(transport.timeoutMs) : '',
    headers: isHttp ? headersToRows(transport.headers) : [],
    queryParams: isHttp ? headersToRows(transport.queryParams) : [],
    authKind: auth?.kind ?? 'none',
    authHeader: auth?.header ?? '',
    authValueEnv: auth?.valueEnv ?? '',
    maxResults: entry.limits ? String(entry.limits.maxResults) : '',
    pageSize: entry.limits ? String(entry.limits.pageSize) : '',
    inputFields: input.fields.length ? input.fields.map(inputFieldToRow) : [makeEmptyInputFieldRow()],
    inputAtLeastOneOf: input.atLeastOneOf ?? [],
    inputRequireGroups: input.requireGroups ?? [],
    outputFields: output.fields.length ? output.fields.map(outputFieldToRow) : [makeEmptyOutputFieldRow()],
    outputTimestampField: output.timestampField,
    outputIdentityField: output.identityField,
    outputLabelField: output.labelField ?? '',
    outputSortOrder: output.sortOrder,
    outputRecordsPath: output.recordsPath ?? '',
    outputTotalPath: output.totalPath ?? '',
    outputRequestIdPath: output.requestIdPath ?? '',
    outputImageRefEnabled: !!output.imageRef,
    outputImageRefBucketField: output.imageRef?.bucketField ?? '',
    outputImageRefObjectKeyField: output.imageRef?.objectKeyField ?? '',
    outputImageRefMimeField: output.imageRef?.mimeField ?? '',
  };
}

/** Builds `transport` for the submit payload. Spreads the ORIGINAL transport
 * object first (when editing) so fields outside the structured form —
 * e.g. `transport.retry` — survive the round trip (phase-03 Risk
 * Assessment), then overlays the fields the form actually edits. */
function buildTransport(values: DatasourceFormValues, original?: TransportConfig): TransportConfig {
  if (values.transportKind === 'mock') {
    const base = original?.kind === 'mock' ? original : {};
    return { ...base, kind: 'mock', dataFile: values.mockDataFile?.trim() ?? '' };
  }

  const base = original?.kind === 'http' ? original : {};
  const auth: TransportAuth | undefined =
    values.authKind === 'none'
      ? undefined
      : {
          kind: values.authKind,
          ...(values.authHeader?.trim() ? { header: values.authHeader.trim() } : {}),
          // API key nhập tay và biến môi trường loại trừ nhau: nhập key thì bỏ valueEnv.
          ...(values.authValueEnv?.trim() && !values.authApiKey?.trim() ? { valueEnv: values.authValueEnv.trim() } : {}),
        };

  return {
    ...base,
    kind: 'http',
    baseUrl: values.httpBaseUrl?.trim() ?? '',
    path: values.httpPath?.trim() ?? '',
    method: values.httpMethod ?? 'GET',
    headers: rowsToHeaders(values.headers),
    queryParams: rowsToHeaders(values.queryParams),
    timeoutMs: values.httpTimeoutMs?.trim() ? Number(values.httpTimeoutMs) : undefined,
    auth,
  };
}

/** Keys of `output` the form edits itself — everything else on the stored object is carried over on save, so a
 * key the form does not know about (newer DSL options) is never silently dropped by "Lưu". */
const OUTPUT_FORM_KEYS = ['timestampField', 'sortOrder', 'identityField', 'labelField', 'fields', 'recordsPath', 'totalPath', 'requestIdPath', 'imageRef'];

function omitKeys<T extends object>(source: T | undefined, keys: string[]): Partial<T> {
  if (!source) return {};
  return Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key))) as Partial<T>;
}

function buildLimits(values: DatasourceFormValues): DatasourceLimits | undefined {
  if (!values.maxResults?.trim() || !values.pageSize?.trim()) return undefined;
  return { maxResults: Number(values.maxResults), pageSize: Number(values.pageSize) };
}

/** Builds `input` for the submit payload from the field-builder rows. */
function buildInput(values: DatasourceFormValues, original?: DatasourceInput): DatasourceInput {
  const atLeastOneOf = values.inputAtLeastOneOf.filter((name) => name.trim());
  const requireGroups = values.inputRequireGroups.map((group) => group.filter((name) => name.trim())).filter((group) => group.length > 0);
  return {
    ...omitKeys(original, ['fields', 'atLeastOneOf', 'requireGroups']),
    fields: values.inputFields.map(rowToInputField),
    ...(atLeastOneOf.length ? { atLeastOneOf } : {}),
    ...(requireGroups.length ? { requireGroups } : {}),
  };
}

/** Builds `output` for the submit payload from the field-builder rows. */
function buildOutput(values: DatasourceFormValues, original?: DatasourceOutput): DatasourceOutput {
  const imageRef =
    values.outputImageRefEnabled &&
    values.outputImageRefBucketField?.trim() &&
    values.outputImageRefObjectKeyField?.trim() &&
    values.outputImageRefMimeField?.trim()
      ? {
          bucketField: values.outputImageRefBucketField.trim(),
          objectKeyField: values.outputImageRefObjectKeyField.trim(),
          mimeField: values.outputImageRefMimeField.trim(),
        }
      : undefined;

  return {
    ...omitKeys(original, OUTPUT_FORM_KEYS),
    timestampField: values.outputTimestampField.trim(),
    sortOrder: values.outputSortOrder,
    identityField: values.outputIdentityField.trim(),
    fields: values.outputFields.map(rowToOutputField),
    ...(values.outputLabelField.trim() ? { labelField: values.outputLabelField.trim() } : {}),
    ...(values.outputRecordsPath?.trim() ? { recordsPath: values.outputRecordsPath.trim() } : {}),
    ...(values.outputTotalPath?.trim() ? { totalPath: values.outputTotalPath.trim() } : {}),
    ...(values.outputRequestIdPath?.trim() ? { requestIdPath: values.outputRequestIdPath.trim() } : {}),
    ...(imageRef ? { imageRef } : {}),
  };
}

/** Form values -> request body for `POST /admin/datasources` / `PUT
 * /admin/datasources/:code`. `permissionCode` is never included — the
 * server always derives it (phase-02 contract). */
export function formValuesToEntryPayload(values: DatasourceFormValues, original?: AdminDatasource) {
  return {
    code: values.code,
    name: values.name,
    description: values.description?.trim() || undefined,
    type: values.type,
    enabled: values.enabled,
    transport: buildTransport(values, original?.transport as TransportConfig | undefined),
    input: buildInput(values, original?.input as DatasourceInput | undefined),
    output: buildOutput(values, original?.output as DatasourceOutput | undefined),
    limits: buildLimits(values),
    ...(values.authKind !== 'none' && values.authApiKey?.trim() ? { apiKey: values.authApiKey.trim() } : {}),
    ...(values.authKind !== 'none' && values.authClearApiKey && !values.authApiKey?.trim() ? { clearApiKey: true } : {}),
  };
}
