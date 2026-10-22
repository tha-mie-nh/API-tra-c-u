import type { DatasourceEntry } from '@app/shared';

/** Resolved (real) secret values for one datasource's transport — never merged into the frozen public config. */
export interface ResolvedHttpSecrets {
  baseUrl: string;
  apiKeyValue?: string;
}
export interface ResolvedMinioPgSecrets {
  pgUrl: string;
  minio: { endpoint: string; port?: number; accessKey: string; secretKey: string; bucket: string; useSsl: boolean };
}
export type ResolvedSecrets = ResolvedHttpSecrets | ResolvedMinioPgSecrets | Record<string, never>;

function requireEnv(name: string, context: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`config.json references env var "${name}" (${context}) but it is not set`);
  }
  return value;
}

/** Resolves a `${VAR_NAME}` whole-string reference; returns the input unchanged if it isn't one. */
function resolveInterpolated(value: string, context: string): string {
  const match = /^\$\{([A-Z0-9_]+)\}$/.exec(value);
  if (!match) return value;
  return requireEnv(match[1] as string, context);
}

/**
 * `${VAR}`/`*Env` resolution (phase-04 Requirements: "Resolve `${ENV_VAR}`
 * references and `*Env` credential fields from `process.env` — never store
 * secrets in the file"). Throws loudly if a referenced env var is absent —
 * called only for enabled datasources by the loader.
 */
export function resolveTransportSecrets(ds: DatasourceEntry): ResolvedSecrets {
  const transport = ds.transport;
  if (transport.kind === 'http') {
    const baseUrl = resolveInterpolated(transport.baseUrl, `${ds.code}.transport.baseUrl`);
    const apiKeyValue =
      transport.auth?.kind && transport.auth.kind !== 'none' && transport.auth.valueEnv
        ? requireEnv(transport.auth.valueEnv, `${ds.code}.transport.auth.valueEnv`)
        : undefined;
    return { baseUrl, apiKeyValue };
  }
  if (transport.kind === 'minio-pg') {
    return {
      pgUrl: requireEnv(transport.pgUrlEnv, `${ds.code}.transport.pgUrlEnv`),
      minio: {
        endpoint: requireEnv(transport.minio.endpointEnv, `${ds.code}.transport.minio.endpointEnv`),
        port: transport.minio.portEnv ? Number(requireEnv(transport.minio.portEnv, `${ds.code}.transport.minio.portEnv`)) : undefined,
        accessKey: requireEnv(transport.minio.accessKeyEnv, `${ds.code}.transport.minio.accessKeyEnv`),
        secretKey: requireEnv(transport.minio.secretKeyEnv, `${ds.code}.transport.minio.secretKeyEnv`),
        bucket: requireEnv(transport.minio.bucketEnv, `${ds.code}.transport.minio.bucketEnv`),
        useSsl: transport.minio.useSslEnv ? requireEnv(transport.minio.useSslEnv, `${ds.code}.transport.minio.useSslEnv`) === 'true' : false,
      },
    };
  }
  return {};
}
