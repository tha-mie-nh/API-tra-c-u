import { UnprocessableEntityException } from '@nestjs/common';
import type { DatasourceEntry } from '@app/shared';

// Matches every existing name in `.env.example` (`CITIZEN_BASIC_API_KEY`,
// `CITIZEN_BASIC_BASE_URL`, ...) — phase-02 Key Insights: mitigates an
// admin pointing `auth.valueEnv` at a core secret (e.g. `JWT_ACCESS_SECRET`)
// plus `baseUrl` at an attacker host, which would make the app send that
// secret as an outbound header. Applied on ADMIN-UI writes only — hand
// edited/boot-time config.json is validated by `config-snapshot-builder.ts`
// alone and is never subject to this policy (no boot regressions).
const API_KEY_ENV_PATTERN = /^[A-Z][A-Z0-9_]*_API_KEY$/;
const BASE_URL_ENV_PATTERN = /^[A-Z][A-Z0-9_]*_BASE_URL$/;
const ENV_VAR_REF_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

/** Every `${VAR}` reference found anywhere inside `value` (not just a whole-string match — `resolveInterpolated` in `transport-secret-resolver.ts` only resolves a whole-string `${VAR}`, but the admin-write policy is deliberately stricter/wider so a baseUrl like `https://${X}/api` is still caught). */
function extractEnvVarRefs(value: string): string[] {
  return Array.from(value.matchAll(ENV_VAR_REF_PATTERN)).map((m) => m[1] as string);
}

/**
 * Enforces the `*_API_KEY`/`*_BASE_URL` env-var naming rule (phase-02 Key
 * Insights #3) against ONE candidate entry — the one an admin write is
 * actually creating/updating. Other entries in the same `config.json`
 * (possibly hand-edited, possibly not following this convention) are never
 * walked here. Throws `UnprocessableEntityException` directly (same
 * `DATASOURCE_CONFIG_INVALID` envelope `buildSnapshot` failures map to) —
 * this check runs BEFORE the write lock/`buildSnapshot`, so it must
 * produce the final HTTP error itself rather than a plain error the
 * caller would otherwise have to translate.
 */
export function assertDatasourceEnvNamePolicy(entry: DatasourceEntry): void {
  if (entry.transport.kind !== 'http') return;

  const issues: { path: string; message: string }[] = [];
  const valueEnv = entry.transport.auth?.valueEnv;
  if (valueEnv && !API_KEY_ENV_PATTERN.test(valueEnv)) {
    issues.push({
      path: 'transport/auth/valueEnv',
      message: `env var name "${valueEnv}" must match ${API_KEY_ENV_PATTERN} (admin-UI naming policy)`,
    });
  }

  // `baseUrl` is technically required for `kind: 'http'` (enforced by
  // `validateCrossFieldConstraints`, which runs AFTER this policy check) —
  // guard here too so a malformed body (missing/non-string baseUrl) hits a
  // controlled 422 instead of a raw TypeError.
  const baseUrl = typeof entry.transport.baseUrl === 'string' ? entry.transport.baseUrl : '';
  for (const name of extractEnvVarRefs(baseUrl)) {
    if (!BASE_URL_ENV_PATTERN.test(name)) {
      issues.push({
        path: 'transport/baseUrl',
        message: `env var name "${name}" referenced in baseUrl must match ${BASE_URL_ENV_PATTERN} (admin-UI naming policy)`,
      });
    }
  }

  if (issues.length > 0) {
    throw new UnprocessableEntityException({
      code: 'DATASOURCE_CONFIG_INVALID',
      message: 'Datasource config is invalid',
      details: issues,
    });
  }
}

/** `GET /admin/datasources/env-refs` data source: every env var NAME
 * currently set on this process that matches either suffix — never a
 * value. Names only, sorted, so the UI can offer a stable picker. */
export function listAvailableEnvRefNames(): { apiKeyEnvNames: string[]; baseUrlEnvNames: string[] } {
  const names = Object.keys(process.env);
  return {
    apiKeyEnvNames: names.filter((n) => API_KEY_ENV_PATTERN.test(n)).sort(),
    baseUrlEnvNames: names.filter((n) => BASE_URL_ENV_PATTERN.test(n)).sort(),
  };
}
