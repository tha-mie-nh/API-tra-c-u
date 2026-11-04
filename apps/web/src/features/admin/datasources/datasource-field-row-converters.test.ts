import { describe, expect, it } from 'vitest';
import type { InputFieldDef, OutputFieldDef } from '@shared/index';
import {
  inputFieldToRow,
  keyValueRowsToRecord,
  outputFieldToRow,
  recordToKeyValueRows,
  rowToInputField,
  rowToOutputField,
} from './datasource-field-row-converters';
import { makeEmptyInputFieldRow, makeEmptyOutputFieldRow } from './datasource-field-row-types';

describe('recordToKeyValueRows / keyValueRowsToRecord (valueMap/iconMap round trip)', () => {
  it('round-trips a populated record', () => {
    const record = { '1': 'Nam', '2': 'Nữ' };
    expect(keyValueRowsToRecord(recordToKeyValueRows(record))).toEqual(record);
  });

  it('returns undefined for an empty record and for rows with a blank key', () => {
    expect(keyValueRowsToRecord(recordToKeyValueRows(undefined))).toBeUndefined();
    expect(keyValueRowsToRecord([{ key: '  ', value: 'x' }])).toBeUndefined();
  });

  it('trims keys but keeps values as-is', () => {
    expect(keyValueRowsToRecord([{ key: ' k ', value: ' v ' }])).toEqual({ k: ' v ' });
  });
});

describe('inputFieldToRow / rowToInputField (input field DSL round trip)', () => {
  it('round-trips a minimal required-only field', () => {
    const field: InputFieldDef = { name: 'citizenId', label: 'Số CCCD', type: 'string' };
    expect(rowToInputField(inputFieldToRow(field))).toEqual(field);
  });

  it('round-trips every optional scalar property', () => {
    const field: InputFieldDef = {
      name: 'fullName',
      label: 'Họ và tên',
      type: 'string',
      required: true,
      minLength: 2,
      maxLength: 100,
      min: 0,
      max: 10,
      pattern: '^[A-Z]',
      format: 'YYYY-MM-DD',
      mapTo: 'ho_ten',
    };
    expect(rowToInputField(inputFieldToRow(field))).toEqual(field);
  });

  it('round-trips enum options, and drops options when type is not enum', () => {
    const field: InputFieldDef = {
      name: 'gender',
      label: 'Giới tính',
      type: 'enum',
      options: [
        { value: 'M', label: 'Nam' },
        { value: 'F', label: 'Nữ' },
      ],
    };
    expect(rowToInputField(inputFieldToRow(field))).toEqual(field);

    const row = inputFieldToRow(field);
    row.type = 'string';
    expect(rowToInputField(row)).not.toHaveProperty('options');
  });

  it("a brand-new empty row builds a field with just name/label/type (name/label empty until the user fills them in)", () => {
    const field = rowToInputField(makeEmptyInputFieldRow());
    expect(field).toEqual({ name: '', label: '', type: 'string' });
  });
});

describe('outputFieldToRow / rowToOutputField (output field DSL round trip)', () => {
  it('round-trips a minimal field (no `from`, e.g. a computed/internal-only field)', () => {
    const field: OutputFieldDef = { name: 'id', label: 'ID', type: 'string' };
    expect(rowToOutputField(outputFieldToRow(field))).toEqual(field);
  });

  it('round-trips `from`, valueMap, iconMap, and all 4 booleans', () => {
    const field: OutputFieldDef = {
      name: 'gender',
      label: 'Giới tính',
      from: 'gioi_tinh',
      type: 'enum',
      valueMap: { '1': 'Nam', '2': 'Nữ' },
      iconMap: { Nam: 'male', Nữ: 'female' },
      sensitive: true,
      internal: true,
      emphasize: true,
      headerField: true,
    };
    expect(rowToOutputField(outputFieldToRow(field))).toEqual(field);
  });

  it('a brand-new empty row builds a field with no booleans/maps set', () => {
    const field = rowToOutputField(makeEmptyOutputFieldRow());
    expect(field).toEqual({ name: '', label: '', type: 'string' });
  });
});
