import { describe, expect, it } from 'vitest';
import type { AdminDatasource } from '@shared/index';
import { entryToFormValues, formValuesToEntryPayload } from './datasource-entry-converters';

function httpAdminDatasource(overrides: Partial<AdminDatasource> = {}): AdminDatasource {
  return {
    code: 'HTTP_DS',
    name: 'Http datasource',
    description: 'desc',
    type: 'info',
    enabled: true,
    permissionCode: 'api:http_ds',
    transport: {
      kind: 'http',
      baseUrl: 'https://upstream.example.com',
      path: '/find',
      method: 'POST',
      timeoutMs: 5000,
      // Not editable from the structured form (phase-03 Risk Assessment) —
      // must survive an edit round trip untouched.
      retry: { attempts: 3, backoffMs: 500 },
      auth: { kind: 'apiKeyHeader', header: 'X-Api-Key', valueEnv: 'HTTP_DS_API_KEY' },
    },
    input: { fields: [{ name: 'id', label: 'ID', type: 'string', required: true }] },
    output: {
      timestampField: 'ts',
      sortOrder: 'desc',
      identityField: 'id',
      fields: [{ name: 'id', label: 'ID', from: 'id', type: 'string' }],
    },
    envStatus: { apiKeyEnvSet: true, baseUrlEnvSet: null },
    ...overrides,
  } as AdminDatasource;
}

describe('datasource entry <-> form value converters (round trip)', () => {
  it('formValuesToEntryPayload keeps an unknown/unedited transport key (retry) from the ORIGINAL entry untouched', () => {
    const original = httpAdminDatasource();
    const values = entryToFormValues(original);

    const payload = formValuesToEntryPayload(values, original);

    expect(payload.transport).toMatchObject({ kind: 'http', retry: { attempts: 3, backoffMs: 500 } });
  });

  it('keeps retry even when the user edits a structured field (baseUrl) in between', () => {
    const original = httpAdminDatasource();
    const values = entryToFormValues(original);
    values.httpBaseUrl = 'https://new-upstream.example.com';

    const payload = formValuesToEntryPayload(values, original);

    expect(payload.transport).toMatchObject({
      kind: 'http',
      baseUrl: 'https://new-upstream.example.com',
      retry: { attempts: 3, backoffMs: 500 },
    });
  });

  it('never includes permissionCode in the submit payload — the server always derives it', () => {
    const original = httpAdminDatasource();
    const values = entryToFormValues(original);

    const payload = formValuesToEntryPayload(values, original);

    expect(payload).not.toHaveProperty('permissionCode');
  });

  it('a brand-new create (no original entry) builds a transport with no leftover keys', () => {
    const original = httpAdminDatasource();
    const values = entryToFormValues(original);

    const payload = formValuesToEntryPayload(values); // no `original` — create flow

    expect(payload.transport).not.toHaveProperty('retry');
  });
});

describe('input/output field builder round trip (follow-up to phase-03: visual builder replaces raw-JSON textareas)', () => {
  it('round-trips a rich input/output DSL — enum options, atLeastOneOf, requireGroups, valueMap, imageRef', () => {
    const original = httpAdminDatasource({
      input: {
        fields: [
          { name: 'citizenId', label: 'Số CCCD', type: 'string', pattern: '^[0-9]{12}$' },
          {
            name: 'gender',
            label: 'Giới tính',
            type: 'enum',
            options: [
              { value: 'M', label: 'Nam' },
              { value: 'F', label: 'Nữ' },
            ],
          },
        ],
        atLeastOneOf: ['citizenId', 'gender'],
        requireGroups: [['citizenId'], ['gender']],
      },
      output: {
        timestampField: 'recordedAt',
        sortOrder: 'desc',
        identityField: 'citizenId',
        recordsPath: 'data.items',
        fields: [
          { name: 'citizenId', label: 'Số CCCD', from: 'cccd', type: 'string', sensitive: true },
          { name: 'gender', label: 'Giới tính', from: 'gt', type: 'enum', valueMap: { '1': 'Nam', '2': 'Nữ' } },
          { name: 'recordedAt', label: 'Thời điểm', from: 'ts', type: 'datetime' },
          { name: 'photoBucket', label: 'Bucket', from: 'bucket', type: 'string', internal: true },
          { name: 'photoKey', label: 'Key', from: 'key', type: 'string', internal: true },
          { name: 'photoMime', label: 'Mime', from: 'mime', type: 'string', internal: true },
        ],
        imageRef: { bucketField: 'photoBucket', objectKeyField: 'photoKey', mimeField: 'photoMime' },
      },
    });

    const values = entryToFormValues(original);
    const payload = formValuesToEntryPayload(values, original);

    expect(payload.input).toEqual(original.input);
    expect(payload.output).toEqual(original.output);
  });

  it('omits atLeastOneOf/requireGroups/imageRef entirely when the builder has none set', () => {
    const original = httpAdminDatasource();
    const values = entryToFormValues(original);

    const payload = formValuesToEntryPayload(values, original);

    expect(payload.input).not.toHaveProperty('atLeastOneOf');
    expect(payload.input).not.toHaveProperty('requireGroups');
    expect(payload.output).not.toHaveProperty('imageRef');
  });
});
