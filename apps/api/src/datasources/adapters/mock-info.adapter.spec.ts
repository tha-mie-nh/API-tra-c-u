import { join } from 'node:path';
import type { DatasourceEntry } from '@app/shared';
import { MockInfoAdapter } from './mock-info.adapter';
import { UpstreamError, UpstreamTimeoutError } from './adapter-errors';

const FIXTURES_DIR = join(__dirname, '..', '..', '..', 'test', 'fixtures', 'datasource-configs');

function makeDatasource(overrides: Partial<DatasourceEntry> = {}): DatasourceEntry {
  return {
    code: 'SAMPLE_DS',
    name: 'Sample',
    type: 'info',
    enabled: true,
    permissionCode: 'api:sample_ds',
    transport: { kind: 'mock', dataFile: 'mock-data/sample.json', timeoutMs: 200 },
    input: { fields: [{ name: 'id', label: 'ID', type: 'string', required: true, mapTo: 'id' }] },
    output: {
      timestampField: 'ts',
      sortOrder: 'desc',
      identityField: 'id',
      fields: [
        { name: 'id', label: 'ID', from: 'id', type: 'string' },
        { name: 'ts', label: 'Timestamp', from: 'ts', type: 'datetime' },
      ],
    },
    ...overrides,
  };
}

describe('MockInfoAdapter', () => {
  it('filters fixture records by the given param via mapTo', async () => {
    const adapter = new MockInfoAdapter(makeDatasource(), FIXTURES_DIR);
    const result = await adapter.execute({ params: { id: 'P1' } });
    expect(result.records).toHaveLength(2);
    expect(result.records.every((r) => r.id === 'P1')).toBe(true);
  });

  it('returns all records when the field is absent from params', async () => {
    const adapter = new MockInfoAdapter(makeDatasource(), FIXTURES_DIR);
    const result = await adapter.execute({ params: {} });
    expect(result.records).toHaveLength(3);
  });

  it('throws UpstreamError on the __FAIL__ magic value', async () => {
    const adapter = new MockInfoAdapter(makeDatasource(), FIXTURES_DIR);
    await expect(adapter.execute({ params: { id: '__FAIL__' } })).rejects.toBeInstanceOf(UpstreamError);
  });

  it('throws UpstreamTimeoutError on the __SLOW__ magic value (exceeds transport.timeoutMs)', async () => {
    const adapter = new MockInfoAdapter(makeDatasource({ transport: { kind: 'mock', dataFile: 'mock-data/sample.json', timeoutMs: 50 } }), FIXTURES_DIR);
    await expect(adapter.execute({ params: { id: '__SLOW__' } })).rejects.toBeInstanceOf(UpstreamTimeoutError);
  }, 10_000);
});
