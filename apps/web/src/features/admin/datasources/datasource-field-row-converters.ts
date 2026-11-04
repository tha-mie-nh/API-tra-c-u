import type { FieldOption, InputFieldDef, OutputFieldDef } from '@shared/index';
import type { FieldOptionRow, InputFieldRow, KeyValueRow, OutputFieldRow } from './datasource-field-row-types';

/** `OutputFieldDef['valueMap'|'iconMap']` (a `Record<string,string>`) <-> the
 * ordered key/value row list the editor renders (object key order isn't
 * guaranteed round-trippable, but these maps are small and unordered by
 * nature — same tradeoff `headersToRows`/`rowsToHeaders` already make). */
export function recordToKeyValueRows(record?: Record<string, string>): KeyValueRow[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ key, value }));
}

export function keyValueRowsToRecord(rows: KeyValueRow[]): Record<string, string> | undefined {
  const entries = rows.filter((r) => r.key.trim().length > 0);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map((r) => [r.key.trim(), r.value]));
}

function optionsToRows(options?: FieldOption[]): FieldOptionRow[] {
  return (options ?? []).map((o) => ({ value: o.value, label: o.label }));
}

function rowsToOptions(rows: FieldOptionRow[]): FieldOption[] | undefined {
  const entries = rows.filter((r) => r.value.trim() || r.label.trim());
  if (entries.length === 0) return undefined;
  return entries.map((r) => ({ value: r.value.trim(), label: r.label.trim() }));
}

/** `InputFieldDef` (API/config shape) -> one editor row, for edit/copy-from prefill. */
export function inputFieldToRow(field: InputFieldDef): InputFieldRow {
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required ?? false,
    minLength: field.minLength !== undefined ? String(field.minLength) : '',
    maxLength: field.maxLength !== undefined ? String(field.maxLength) : '',
    min: field.min !== undefined ? String(field.min) : '',
    max: field.max !== undefined ? String(field.max) : '',
    pattern: field.pattern ?? '',
    format: field.format ?? '',
    mapTo: field.mapTo ?? '',
    options: optionsToRows(field.options),
  };
}

/** Editor row -> `InputFieldDef` for the submit payload. Empty optional
 * inputs are omitted entirely (not sent as `""`/`0`) so the resulting JSON
 * matches what a hand-written config would look like. */
export function rowToInputField(row: InputFieldRow): InputFieldDef {
  const field: InputFieldDef = { name: row.name.trim(), label: row.label.trim(), type: row.type };
  if (row.required) field.required = true;
  if (row.minLength.trim()) field.minLength = Number(row.minLength);
  if (row.maxLength.trim()) field.maxLength = Number(row.maxLength);
  if (row.min.trim()) field.min = Number(row.min);
  if (row.max.trim()) field.max = Number(row.max);
  if (row.pattern.trim()) field.pattern = row.pattern.trim();
  if (row.format.trim()) field.format = row.format.trim();
  if (row.mapTo.trim()) field.mapTo = row.mapTo.trim();
  if (row.type === 'enum') {
    const options = rowsToOptions(row.options);
    if (options) field.options = options;
  }
  return field;
}

/** `OutputFieldDef` -> one editor row. */
export function outputFieldToRow(field: OutputFieldDef): OutputFieldRow {
  return {
    name: field.name,
    label: field.label,
    from: field.from ?? '',
    type: field.type,
    valueMap: recordToKeyValueRows(field.valueMap),
    iconMap: recordToKeyValueRows(field.iconMap),
    sensitive: field.sensitive ?? false,
    internal: field.internal ?? false,
    emphasize: field.emphasize ?? false,
    headerField: field.headerField ?? false,
  };
}

/** Editor row -> `OutputFieldDef` for the submit payload. */
export function rowToOutputField(row: OutputFieldRow): OutputFieldDef {
  const field: OutputFieldDef = { name: row.name.trim(), label: row.label.trim(), type: row.type };
  if (row.from.trim()) field.from = row.from.trim();
  const valueMap = keyValueRowsToRecord(row.valueMap);
  if (valueMap) field.valueMap = valueMap;
  const iconMap = keyValueRowsToRecord(row.iconMap);
  if (iconMap) field.iconMap = iconMap;
  if (row.sensitive) field.sensitive = true;
  if (row.internal) field.internal = true;
  if (row.emphasize) field.emphasize = true;
  if (row.headerField) field.headerField = true;
  return field;
}
