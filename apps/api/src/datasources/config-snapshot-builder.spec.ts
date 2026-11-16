import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DatasourceConfigFile } from '@app/shared';
import { apiPermissionCode } from '@app/shared';
import { buildConfigSnapshot } from './config-snapshot-builder';
import { DatasourceConfigInvalidError } from './datasource-config-invalid.error';

/** Pure-function unit tests for `buildConfigSnapshot` itself (AJV ->
 * cross-field -> secret resolution -> no-mock-in-prod -> deep freeze),
 * isolated from `DatasourceConfigLoaderService`/disk I/O — `configDir` only
 * needs to be a plausible absolute path string (cross-field's containment
 * check is pure string resolution, never touches the filesystem), and the
 * loader-level boot specs (`datasource-config.loader.spec.ts`,
 * `config-reload-pipeline.spec.ts`) already cover the file-path-driven
 * scenarios. This file asserts the structured `issues[]` shape directly. */
const CONFIG_DIR = join(tmpdir(), 'config-snapshot-builder-spec-fake-dir');

function mockEntry(code: string, overrides: Record<string, unknown> = {}) {
  return {
    code,
    name: `Test ${code}`,
    type: 'info',
    enabled: true,
    permissionCode: apiPermissionCode(code),
    transport: { kind: 'mock', dataFile: 'mock-data/sample.json' },
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
    ...overrides,
  };
}

function httpEntry(code: string, overrides: Record<string, unknown> = {}) {
  return mockEntry(code, {
    transport: { kind: 'http', baseUrl: 'https://upstream.example.com', path: '/find', method: 'POST' },
    ...overrides,
  });
}

function configFile(datasources: unknown[]): DatasourceConfigFile {
  return {
    version: 1,
    defaults: { maxResults: 100, pageSize: 20, timeoutMs: 5000, retry: { attempts: 1, backoffMs: 100 } },
    datasources,
  } as unknown as DatasourceConfigFile;
}

describe('buildConfigSnapshot', () => {
  it('returns a deep-frozen snapshot for a valid candidate (nested objects frozen too, not just top-level)', () => {
    const raw = configFile([mockEntry('SAMPLE_DS')]);
    const snapshot = buildConfigSnapshot(raw, { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false });

    expect(Object.isFrozen(snapshot.config)).toBe(true);
    expect(Object.isFrozen(snapshot.config.datasources[0])).toBe(true);
    expect(Object.isFrozen(snapshot.config.datasources[0]!.input)).toBe(true);
    expect(Object.isFrozen(snapshot.config.datasources[0]!.output.fields[0])).toBe(true);
  });

  it('throws a structured AJV issue (instancePath-based path) for a schema violation', () => {
    const raw = configFile([mockEntry('BAD_DS', { type: 'not-a-real-type' })]);

    try {
      buildConfigSnapshot(raw, { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false });
      throw new Error('expected buildConfigSnapshot to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DatasourceConfigInvalidError);
      const issues = (err as DatasourceConfigInvalidError).issues;
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]!.path).toContain('/datasources/0/type');
    }
  });

  it('cross-field: duplicate datasource code -> issue with root path', () => {
    const raw = configFile([mockEntry('DUP_DS'), mockEntry('DUP_DS')]);

    try {
      buildConfigSnapshot(raw, { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false });
      throw new Error('expected to throw');
    } catch (err) {
      const issues = (err as DatasourceConfigInvalidError).issues;
      expect(issues[0]).toEqual({ path: '', message: expect.stringContaining('duplicate datasource code') });
    }
  });

  it('cross-field: output.identityField not present in output.fields -> issue', () => {
    const raw = configFile([
      mockEntry('BAD_IDENTITY', { output: { timestampField: 'ts', sortOrder: 'desc', identityField: 'nope', fields: [{ name: 'ts', label: 'Ts', from: 'ts', type: 'datetime' }] } }),
    ]);

    expect(() => buildConfigSnapshot(raw, { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false })).toThrow(
      /identityField "nope" is not in output\.fields/,
    );
  });

  it('cross-field: permissionCode not matching the code derivation -> issue', () => {
    const raw = configFile([mockEntry('MISMATCH_DS', { permissionCode: 'api:some_other_code' })]);

    expect(() => buildConfigSnapshot(raw, { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false })).toThrow(
      /does not match the required derivation/,
    );
  });

  it('cross-field: a mock dataFile resolving outside configDir -> issue (path traversal guard)', () => {
    const raw = configFile([mockEntry('TRAVERSAL_DS', { transport: { kind: 'mock', dataFile: '../../../etc/passwd' } })]);

    expect(() => buildConfigSnapshot(raw, { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false })).toThrow(
      /resolves outside configDir/,
    );
  });

  it('a mock dataFile resolving INSIDE configDir does not trigger the containment issue', () => {
    const raw = configFile([mockEntry('CONTAINED_DS', { transport: { kind: 'mock', dataFile: 'mock-data/sample.json' } })]);

    expect(() => buildConfigSnapshot(raw, { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false })).not.toThrow();
  });

  it('missing env var for an ENABLED http datasource -> issue scoped to that datasource\'s transport', () => {
    const raw = configFile([httpEntry('HTTP_DS', { enabled: true, transport: { kind: 'http', baseUrl: '${CSB_MISSING_BASE_URL}', path: '/find', method: 'POST' } })]);

    try {
      buildConfigSnapshot(raw, { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false });
      throw new Error('expected to throw');
    } catch (err) {
      const issues = (err as DatasourceConfigInvalidError).issues;
      expect(issues[0]!.path).toBe('datasources/HTTP_DS/transport');
      expect(issues[0]!.message).toContain('CSB_MISSING_BASE_URL');
    }
  });

  it('a DISABLED datasource with a missing env var does not throw (secrets only resolved for enabled ones)', () => {
    const raw = configFile([httpEntry('DISABLED_HTTP_DS', { enabled: false, transport: { kind: 'http', baseUrl: '${CSB_MISSING_BASE_URL_2}', path: '/find', method: 'POST' } })]);

    expect(() => buildConfigSnapshot(raw, { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false })).not.toThrow();
  });

  it('NODE_ENV=production with an enabled mock datasource -> issue (no-mock-in-prod)', () => {
    const raw = configFile([mockEntry('PROD_MOCK_DS')]);

    expect(() => buildConfigSnapshot(raw, { configDir: CONFIG_DIR, nodeEnv: 'production', allowMock: false })).toThrow(
      /Refusing to start/,
    );
  });

  it('NODE_ENV=production + allowMock=true (ALLOW_MOCK_DATASOURCES escape hatch) -> OK', () => {
    const raw = configFile([mockEntry('PROD_MOCK_ALLOWED_DS')]);

    expect(() => buildConfigSnapshot(raw, { configDir: CONFIG_DIR, nodeEnv: 'production', allowMock: true })).not.toThrow();
  });

  describe('dictionaries', () => {
    const opts = { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false };
    const withRefs = (): DatasourceConfigFile => ({
      ...configFile([
        mockEntry('DICT_DS', {
          input: { fields: [{ name: 'gioiTinh', label: 'Giới tính', type: 'enum', optionsRef: 'GENDER' }] },
          output: {
            timestampField: 'ts',
            sortOrder: 'desc',
            identityField: 'id',
            fields: [
              { name: 'id', label: 'ID', type: 'string' },
              { name: 'ts', label: 'TS', type: 'datetime' },
              { name: 'gioiTinh', label: 'Giới tính', type: 'enum', valueMapRef: 'GENDER' },
            ],
          },
        }),
      ]),
      dictionaries: { GENDER: [{ value: 'M', label: 'Nam' }, { value: 'F', label: 'Nữ' }] },
    });

    it('inlines optionsRef/valueMapRef into the runtime config but keeps the refs in `source`', () => {
      const snapshot = buildConfigSnapshot(withRefs(), opts);
      const ds = snapshot.config.datasources[0]!;
      expect(ds.input.fields[0]!.options).toEqual([{ value: 'M', label: 'Nam' }, { value: 'F', label: 'Nữ' }]);
      expect(ds.output.fields[2]!.valueMap).toEqual({ M: 'Nam', F: 'Nữ' });
      expect(snapshot.source.datasources[0]!.input.fields[0]!.options).toBeUndefined();
      expect(snapshot.source.datasources[0]!.input.fields[0]!.optionsRef).toBe('GENDER');
    });

    it('rejects a reference to an unknown dictionary', () => {
      const raw = withRefs();
      raw.dictionaries = {};
      expect(() => buildConfigSnapshot(raw, opts)).toThrow(/unknown dictionary "GENDER"/);
    });

    it('rejects duplicate values inside a dictionary and invalid time zones', () => {
      const dup = withRefs();
      dup.dictionaries = { GENDER: [{ value: 'M', label: 'A' }, { value: 'M', label: 'B' }] };
      expect(() => buildConfigSnapshot(dup, opts)).toThrow(/duplicate value "M"/);

      const tz = configFile([mockEntry('TZ_DS')]);
      (tz.datasources[0]!.output.fields[1] as unknown as Record<string, unknown>).displayTimeZone = 'Mars/Base';
      expect(() => buildConfigSnapshot(tz, opts)).toThrow(/not a valid IANA time zone/);
    });
  });

  it('applies file `defaults` (retry, timeout, limits) to the runtime config but not to `source`', () => {
    const snapshot = buildConfigSnapshot(configFile([httpEntry('DEFAULTS_DS')]), { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false });
    const runtime = snapshot.config.datasources[0]!;
    expect(runtime.transport).toMatchObject({ retry: { attempts: 1, backoffMs: 100 }, timeoutMs: 5000 });
    expect(runtime.limits).toEqual({ maxResults: 100, pageSize: 20 });
    expect(snapshot.source.datasources[0]!.limits).toBeUndefined();
    expect((snapshot.source.datasources[0]!.transport as { retry?: unknown }).retry).toBeUndefined();
  });

  it('keeps an explicit transport.retry/timeoutMs over the defaults', () => {
    const entry = httpEntry('OWN_RETRY_DS');
    Object.assign(entry.transport, { retry: { attempts: 0, backoffMs: 10 }, timeoutMs: 1234 });
    const snapshot = buildConfigSnapshot(configFile([entry]), { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false });
    expect(snapshot.config.datasources[0]!.transport).toMatchObject({ retry: { attempts: 0, backoffMs: 10 }, timeoutMs: 1234 });
  });

  it('accepts displayFormat, time zones and transport.queryParams (schema regression)', () => {
    const entry = httpEntry('NEW_KEYS_DS');
    (entry.transport as Record<string, unknown>).queryParams = { tab: '1' };
    (entry.output.fields[1] as Record<string, unknown>).displayFormat = 'DD/MM/YYYY HH:mm';
    (entry.output.fields[1] as Record<string, unknown>).sourceTimeZone = 'Asia/Ho_Chi_Minh';
    expect(() => buildConfigSnapshot(configFile([entry]), { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false })).not.toThrow();
  });

  describe('input field `in` / `format`', () => {
    const opts = { configDir: CONFIG_DIR, nodeEnv: 'development', allowMock: false };
    const withInput = (method: 'GET' | 'POST', field: Record<string, unknown>) => {
      const entry = httpEntry('IN_DS', { input: { fields: [{ name: 'q', label: 'Q', type: 'string', ...field }] } });
      (entry.transport as Record<string, unknown>).method = method;
      return configFile([entry]);
    };

    it('accepts `in: query` on a POST and a date `format` (schema regression)', () => {
      expect(() => buildConfigSnapshot(withInput('POST', { in: 'query' }), opts)).not.toThrow();
      expect(() => buildConfigSnapshot(withInput('GET', { type: 'date', format: 'DD/MM/YYYY' }), opts)).not.toThrow();
    });

    it('rejects `in: body` when the transport method is GET (a GET has no body)', () => {
      expect(() => buildConfigSnapshot(withInput('GET', { in: 'body' }), opts)).toThrow(/has in=body but the transport method is GET/);
    });

    it('rejects an unknown `in` value', () => {
      expect(() => buildConfigSnapshot(withInput('POST', { in: 'header' }), opts)).toThrow();
    });
  });
});

