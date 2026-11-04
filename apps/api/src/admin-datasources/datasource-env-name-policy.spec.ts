import { UnprocessableEntityException } from '@nestjs/common';
import type { DatasourceEntry } from '@app/shared';
import { assertDatasourceEnvNamePolicy, listAvailableEnvRefNames } from './datasource-env-name-policy';

function httpEntry(overrides: { baseUrl: string; valueEnv?: string }): DatasourceEntry {
  return {
    code: 'TEST_DS',
    name: 'Test',
    type: 'info',
    enabled: true,
    permissionCode: 'api:test_ds',
    transport: {
      kind: 'http',
      baseUrl: overrides.baseUrl,
      path: '/find',
      method: 'POST',
      ...(overrides.valueEnv ? { auth: { kind: 'apiKeyHeader', header: 'X-Api-Key', valueEnv: overrides.valueEnv } } : {}),
    },
    input: { fields: [{ name: 'id', label: 'ID', type: 'string', required: true }] },
    output: {
      timestampField: 'ts',
      sortOrder: 'desc',
      identityField: 'id',
      fields: [
        { name: 'id', label: 'ID', from: 'id', type: 'string' },
        { name: 'ts', label: 'Timestamp', from: 'ts', type: 'datetime' },
      ],
    },
  };
}

describe('assertDatasourceEnvNamePolicy', () => {
  it('allows a valueEnv matching *_API_KEY and a baseUrl referencing *_BASE_URL', () => {
    const entry = httpEntry({ baseUrl: '${TEST_DS_BASE_URL}', valueEnv: 'TEST_DS_API_KEY' });
    expect(() => assertDatasourceEnvNamePolicy(entry)).not.toThrow();
  });

  it('rejects a valueEnv that does not end in _API_KEY (secret-exfil guard)', () => {
    const entry = httpEntry({ baseUrl: 'https://upstream.example.com', valueEnv: 'JWT_ACCESS_SECRET' });
    expect(() => assertDatasourceEnvNamePolicy(entry)).toThrow(UnprocessableEntityException);
    try {
      assertDatasourceEnvNamePolicy(entry);
    } catch (err) {
      const details = (err as UnprocessableEntityException).getResponse() as { details: { path: string }[] };
      expect(details.details[0]?.path).toBe('transport/auth/valueEnv');
    }
  });

  it('rejects a ${VAR} inside baseUrl that does not end in _BASE_URL', () => {
    const entry = httpEntry({ baseUrl: '${JWT_ACCESS_SECRET}/api' });
    expect(() => assertDatasourceEnvNamePolicy(entry)).toThrow(UnprocessableEntityException);
  });

  it('allows a literal baseUrl with no ${VAR} reference at all', () => {
    const entry = httpEntry({ baseUrl: 'https://upstream.example.com/find' });
    expect(() => assertDatasourceEnvNamePolicy(entry)).not.toThrow();
  });

  it('skips the policy entirely for non-http transports (mock/minio-pg)', () => {
    const mockEntry: DatasourceEntry = {
      ...httpEntry({ baseUrl: 'irrelevant' }),
      transport: { kind: 'mock', dataFile: 'mock-data/x.json' },
    };
    expect(() => assertDatasourceEnvNamePolicy(mockEntry)).not.toThrow();
  });
});

describe('listAvailableEnvRefNames', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns only matching env var NAMES, never values, sorted', () => {
    process.env.ZZZ_TEST_API_KEY = 'secret-value';
    process.env.AAA_TEST_API_KEY = 'another-secret';
    process.env.AAA_TEST_BASE_URL = 'http://example.com';
    process.env.UNRELATED_VAR = 'noise';

    const refs = listAvailableEnvRefNames();

    expect(refs.apiKeyEnvNames).toEqual(expect.arrayContaining(['AAA_TEST_API_KEY', 'ZZZ_TEST_API_KEY']));
    expect(refs.baseUrlEnvNames).toEqual(expect.arrayContaining(['AAA_TEST_BASE_URL']));
    expect(refs.apiKeyEnvNames.indexOf('AAA_TEST_API_KEY')).toBeLessThan(refs.apiKeyEnvNames.indexOf('ZZZ_TEST_API_KEY'));
    expect(JSON.stringify(refs)).not.toContain('secret-value');
    expect(JSON.stringify(refs)).not.toContain('another-secret');
  });
});
