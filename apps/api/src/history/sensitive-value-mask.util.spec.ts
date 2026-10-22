import type { DatasourceEntry } from '@app/shared';
import { maskValue, summarizeQueryParams } from './sensitive-value-mask.util';

const entry: DatasourceEntry = {
  code: 'SAMPLE_DS',
  name: 'Sample',
  type: 'info',
  enabled: true,
  permissionCode: 'api:sample_ds',
  transport: { kind: 'mock', dataFile: 'x.json' },
  input: {
    fields: [
      { name: 'citizenId', label: 'Số CCCD', type: 'string' },
      { name: 'fullName', label: 'Họ và tên', type: 'string' },
    ],
  },
  output: {
    timestampField: 'recordedAt',
    sortOrder: 'desc',
    identityField: 'citizenId',
    fields: [
      { name: 'citizenId', label: 'Số CCCD', type: 'string', sensitive: true },
      { name: 'fullName', label: 'Họ và tên', type: 'string' },
    ],
  },
};

describe('maskValue', () => {
  it('reveals only the last 4 characters', () => {
    expect(maskValue('001099001234')).toBe('********1234');
  });

  it('stars out the whole value when 4 chars or shorter', () => {
    expect(maskValue('abcd')).toBe('****');
    expect(maskValue('ab')).toBe('**');
  });
});

describe('summarizeQueryParams', () => {
  const params = { citizenId: '001099001234', fullName: 'Nguyễn Văn A' };

  it('mask: false returns the real values (write-time — query_logs stores the truth)', () => {
    const result = summarizeQueryParams(entry, params, { mask: false });
    expect(result.params.citizenId).toBe('001099001234');
    expect(result.summary).toContain('001099001234');
  });

  it('mask: true stars out only fields marked sensitive in output.fields', () => {
    const result = summarizeQueryParams(entry, params, { mask: true });
    expect(result.params.citizenId).toBe('********1234');
    expect(result.params.fullName).toBe('Nguyễn Văn A');
    expect(result.summary).toContain('********1234');
    expect(result.summary).not.toContain('001099001234');
  });

  it('skips blank/undefined/null params entirely, mask: true or false', () => {
    const result = summarizeQueryParams(entry, { citizenId: '', fullName: undefined }, { mask: true });
    expect(result.params).toEqual({});
    expect(result.summary).toBe('');
  });

  it('returns nothing (not a crash) when the datasource entry is unresolvable — no input.fields to label against', () => {
    const result = summarizeQueryParams(undefined, params, { mask: true });
    expect(result.params).toEqual({});
    expect(result.summary).toBe('');
  });
});
