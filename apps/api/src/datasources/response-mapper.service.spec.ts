import type { DatasourceEntry } from '@app/shared';
import { ResponseMapperService } from './response-mapper.service';
import type { RawRecord } from './adapters/datasource-adapter.interface';

function makeDatasource(overrides: Partial<DatasourceEntry> = {}): DatasourceEntry {
  return {
    code: 'TEST_DS',
    name: 'Test datasource',
    type: 'info',
    enabled: true,
    permissionCode: 'api:test_ds',
    transport: { kind: 'mock', dataFile: 'x.json' },
    input: { fields: [] },
    output: {
      timestampField: 'recordedAt',
      sortOrder: 'desc',
      identityField: 'citizenId',
      fields: [
        { name: 'citizenId', label: 'CCCD', from: 'cccd', type: 'string' },
        { name: 'fullName', label: 'Full name', from: 'ho_ten', type: 'string' },
        { name: 'gender', label: 'Gender', from: 'gioi_tinh', type: 'enum', valueMap: { '1': 'Nam', '2': 'Nữ' } },
        { name: 'recordedAt', label: 'Recorded at', from: 'thoi_diem', type: 'datetime' },
        { name: 'secretField', label: 'Internal', from: 'internal_raw', type: 'string', internal: true },
      ],
    },
    limits: { maxResults: 100, pageSize: 20 },
    ...overrides,
  };
}

describe('ResponseMapperService', () => {
  const mapper = new ResponseMapperService();

  const raw: RawRecord[] = [
    { cccd: 'A1', ho_ten: 'Nguyễn Văn A', gioi_tinh: '1', thoi_diem: '2024-01-01T00:00:00Z', internal_raw: 'x' },
    { cccd: 'A1', ho_ten: 'Nguyễn Văn A', gioi_tinh: '1', thoi_diem: '2026-01-01T00:00:00Z', internal_raw: 'y' },
    { cccd: 'B2', ho_ten: 'Trần Thị B', gioi_tinh: '2', thoi_diem: '2025-01-01T00:00:00Z', internal_raw: 'z' },
  ];

  it('renames fields via `from`, applies valueMap, and groups by identityField', () => {
    const envelope = mapper.map(raw, makeDatasource(), { requestId: 'r1', tookMs: 5 });

    expect(envelope.groups).toHaveLength(2);
    const groupA = envelope.groups.find((g) => g.identity === 'A1');
    expect(groupA?.label).toBe('Nguyễn Văn A');
    expect(groupA?.records[0]?.gender).toBe('Nam');
  });

  it('sorts each group by timestampField per sortOrder (desc = newest first)', () => {
    const envelope = mapper.map(raw, makeDatasource(), { requestId: 'r1', tookMs: 5 });
    const groupA = envelope.groups.find((g) => g.identity === 'A1');
    expect(groupA?.records.map((r) => r.recordedAt)).toEqual(['2026-01-01T00:00:00Z', '2024-01-01T00:00:00Z']);
  });

  it('sorts ascending when sortOrder=asc', () => {
    const ds = makeDatasource({ output: { ...makeDatasource().output, sortOrder: 'asc' } });
    const envelope = mapper.map(raw, ds, { requestId: 'r1', tookMs: 5 });
    const groupA = envelope.groups.find((g) => g.identity === 'A1');
    expect(groupA?.records.map((r) => r.recordedAt)).toEqual(['2024-01-01T00:00:00Z', '2026-01-01T00:00:00Z']);
  });

  it('caps at limits.maxResults and sets page.truncated', () => {
    const ds = makeDatasource({ limits: { maxResults: 2, pageSize: 20 } });
    const envelope = mapper.map(raw, ds, { requestId: 'r1', tookMs: 5 });
    expect(envelope.page.total).toBe(3);
    expect(envelope.page.truncated).toBe(true);
    expect(envelope.page.returned).toBe(2);
  });

  it('paginates via page/pageSize', () => {
    const ds = makeDatasource({ limits: { maxResults: 100, pageSize: 1 } });
    const page1 = mapper.map(raw, ds, { page: 1, pageSize: 1, requestId: 'r1', tookMs: 0 });
    const page2 = mapper.map(raw, ds, { page: 2, pageSize: 1, requestId: 'r1', tookMs: 0 });
    expect(page1.page.returned).toBe(1);
    expect(page2.page.returned).toBe(1);
    expect(page1.groups[0]?.records[0]).not.toEqual(page2.groups[0]?.records[0]);
  });

  it('toClientEnvelope strips internal output fields from columns and records', () => {
    const ds = makeDatasource();
    const envelope = mapper.map(raw, ds, { requestId: 'r1', tookMs: 0 });
    expect(envelope.columns.some((c) => c.name === 'secretField')).toBe(true);
    expect(envelope.groups[0]?.records[0]).toHaveProperty('secretField');

    const client = mapper.toClientEnvelope(envelope, ds);
    expect(client.columns.some((c) => c.name === 'secretField')).toBe(false);
    expect(client.groups[0]?.records[0]).not.toHaveProperty('secretField');
  });
});
