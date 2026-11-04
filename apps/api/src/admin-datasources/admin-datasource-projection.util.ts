import type { AdminDatasource, DatasourceEntry } from '@app/shared';

/** Derives `envStatus` at response time (never stored) so the admin UI can
 * show "env var set on this instance?" without ever receiving a value —
 * `null` means "not applicable" (non-http transport, or no env var
 * referenced at all), as opposed to `false` ("referenced but unset"). */
function computeEnvStatus(entry: DatasourceEntry): AdminDatasource['envStatus'] {
  if (entry.transport.kind !== 'http') return { apiKeyEnvSet: null, baseUrlEnvSet: null };

  const valueEnv = entry.transport.auth?.valueEnv;
  const apiKeyEnvSet = valueEnv ? Boolean(process.env[valueEnv]) : null;

  const baseUrlRefs = Array.from(entry.transport.baseUrl.matchAll(/\$\{([A-Z0-9_]+)\}/g)).map((m) => m[1] as string);
  const baseUrlEnvSet = baseUrlRefs.length > 0 ? baseUrlRefs.every((name) => Boolean(process.env[name])) : null;

  return { apiKeyEnvSet, baseUrlEnvSet };
}

/** `DatasourceEntry` (server shape) -> `AdminDatasource` (API response
 * shape): identical fields plus the derived `envStatus`. Config never holds
 * secret VALUES to begin with, so no redaction is needed here (unlike
 * `DatasourceRegistryService.toClientProjection`, which strips `transport`
 * entirely for the non-admin client projection). */
export function toAdminDatasourceProjection(entry: DatasourceEntry): AdminDatasource {
  return {
    code: entry.code,
    name: entry.name,
    description: entry.description,
    type: entry.type,
    enabled: entry.enabled,
    permissionCode: entry.permissionCode,
    transport: entry.transport,
    input: entry.input,
    output: entry.output,
    limits: entry.limits,
    envStatus: computeEnvStatus(entry),
  };
}
