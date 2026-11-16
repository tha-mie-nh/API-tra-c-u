import type { InputFieldDef } from '@app/shared';
import { formatDateValue } from '../date-format-parser.util';
import { buildUpstreamParts } from './upstream-request-params.util';

const fields: InputFieldDef[] = [
  { name: 'soHC', label: 'Số hộ chiếu', type: 'string' },
  { name: 'ngaySinh', label: 'Ngày sinh', type: 'date', format: 'DD/MM/YYYY' },
  { name: 'page', label: 'Trang', type: 'number', in: 'query' },
];
const params = { soHC: 'B123', ngaySinh: '1999-05-12', page: 2 };

describe('formatDateValue', () => {
  it('rewrites the digits in the upstream format without time-zone conversion', () => {
    expect(formatDateValue('1999-05-12', 'DD/MM/YYYY')).toBe('12/05/1999');
    expect(formatDateValue('1999-05-12', 'YYYYMMDD')).toBe('19990512');
    expect(formatDateValue('2026-01-15T09:30:45Z', 'DD-MM-YYYY HH:mm:ss')).toBe('15-01-2026 09:30:45');
    expect(formatDateValue('2026-01-15T09:30', 'YYYY-MM-DD HH:mm:ss')).toBe('2026-01-15 09:30:00');
  });

  it('returns a value that is not in the expected shape unchanged', () => {
    expect(formatDateValue('không phải ngày', 'DD/MM/YYYY')).toBe('không phải ngày');
  });
});

describe('buildUpstreamParts', () => {
  it('POST: body by default, `in: query` fields go to the query string, dates use the input format', () => {
    const { body, query } = buildUpstreamParts(fields, params, 'POST');
    expect(body).toEqual({ soHC: 'B123', ngaySinh: '12/05/1999' });
    expect(query).toEqual({ page: '2' });
  });

  it('POST with every field in the query: the body is empty (search by params only)', () => {
    const all = fields.map((f) => ({ ...f, in: 'query' as const }));
    const { body, query } = buildUpstreamParts(all, params, 'POST');
    expect(body).toEqual({});
    expect(query).toEqual({ soHC: 'B123', ngaySinh: '12/05/1999', page: '2' });
  });

  it('GET: everything is sent as query params (a GET has no body)', () => {
    const { body, query } = buildUpstreamParts(fields, params, 'GET');
    expect(body).toEqual({});
    expect(query).toEqual({ soHC: 'B123', ngaySinh: '12/05/1999', page: '2' });
  });

  it('uses mapTo as the upstream key and skips fields the user left empty', () => {
    const mapped: InputFieldDef[] = [{ name: 'a', label: 'A', type: 'string', mapTo: 'ma' }, { name: 'b', label: 'B', type: 'string' }];
    expect(buildUpstreamParts(mapped, { a: 'x' }, 'POST').body).toEqual({ ma: 'x' });
  });
});
