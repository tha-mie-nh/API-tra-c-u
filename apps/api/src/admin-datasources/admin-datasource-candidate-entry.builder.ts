import { UnprocessableEntityException } from '@nestjs/common';
import type { DatasourceEntry } from '@app/shared';
import { apiPermissionCode } from '@app/shared';
import { assertDatasourceEnvNamePolicy } from './datasource-env-name-policy';

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new UnprocessableEntityException({
      code: 'DATASOURCE_CONFIG_INVALID',
      message: 'Datasource config is invalid',
      details: [{ path: '', message: 'request body must be a JSON object' }],
    });
  }
  return body as Record<string, unknown>;
}

/**
 * Builds a candidate `DatasourceEntry` from an unknown JSON body (phase-02
 * Key Insights: the AJV schema is the shape's source of truth, so the body
 * is accepted as `unknown` and only lightly shaped here before being handed
 * to `buildSnapshot`). `code` always comes from the path param when present
 * (PUT); `permissionCode` is ALWAYS server-derived and never trusted from
 * the body — renaming would orphan the permission row/audit history.
 * Rejects `minio-pg` and the `*_API_KEY`/`*_BASE_URL` naming policy up
 * front, before the caller ever acquires the write lock or touches disk.
 */
export function buildCandidateDatasourceEntry(body: unknown, pathCode: string | undefined): DatasourceEntry {
  const record = asRecord(body);
  const bodyCode = record.code;
  if (pathCode !== undefined && bodyCode !== undefined && bodyCode !== pathCode) {
    throw new UnprocessableEntityException({
      code: 'DATASOURCE_CONFIG_INVALID',
      message: 'Datasource config is invalid',
      details: [{ path: 'code', message: 'body code must equal the path :code or be absent' }],
    });
  }

  const code = pathCode ?? bodyCode;
  if (typeof code !== 'string' || code.length === 0) {
    throw new UnprocessableEntityException({
      code: 'DATASOURCE_CONFIG_INVALID',
      message: 'Datasource config is invalid',
      details: [{ path: 'code', message: 'code is required' }],
    });
  }

  const entry = { ...record, code, permissionCode: apiPermissionCode(code) } as unknown as DatasourceEntry;

  if (entry.transport?.kind === 'minio-pg') {
    throw new UnprocessableEntityException({
      code: 'DATASOURCE_CONFIG_INVALID',
      message: 'Datasource config is invalid',
      details: [{ path: 'transport/kind', message: 'minio-pg transport cannot be created/edited from the admin UI' }],
    });
  }
  assertDatasourceEnvNamePolicy(entry);
  return entry;
}
