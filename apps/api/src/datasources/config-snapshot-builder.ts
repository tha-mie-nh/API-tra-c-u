import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatasourceConfigFile } from '@app/shared';
import { validateCrossFieldConstraints } from './config-cross-field-validator';
import { resolveTransportSecrets, type ResolvedSecrets } from './transport-secret-resolver';
import { DatasourceConfigInvalidError, type DatasourceConfigIssue } from './datasource-config-invalid.error';

/** Immutable result of validating one candidate config — never mutated after `buildConfigSnapshot` returns it. */
export interface ConfigSnapshot {
  readonly config: DatasourceConfigFile;
  readonly resolvedSecrets: ReadonlyMap<string, ResolvedSecrets>;
  readonly configDir: string;
}

export interface BuildSnapshotOptions {
  configDir: string;
  nodeEnv: string;
  allowMock: boolean;
}

// Same depth as datasource-config.loader.ts's REPO_ROOT (this file lives in
// the same directory): src/datasources -> src -> api -> apps -> repo root.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const CONFIG_SCHEMA_PATH = join(REPO_ROOT, 'config', 'config.schema.json');

let cachedValidate: ValidateFunction | undefined;

/** Compiles `config.schema.json` once per process — AJV compilation is the most expensive part of a reload and the schema file itself never changes at runtime. */
function getValidateFn(): ValidateFunction {
  if (!cachedValidate) {
    const schema = JSON.parse(readFileSync(CONFIG_SCHEMA_PATH, 'utf-8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    cachedValidate = ajv.compile(schema as object);
  }
  return cachedValidate;
}

function ajvErrorsToIssues(errors: ErrorObject[] | null | undefined): DatasourceConfigIssue[] {
  return (errors ?? []).map((e) => ({ path: e.instancePath, message: e.message ?? 'invalid' }));
}

/**
 * Pure validate + resolve pipeline (phase-01 Architecture): AJV schema ->
 * cross-field constraints -> per-enabled-datasource secret/env resolution ->
 * no-mock-in-production -> deep freeze. Never mutates `raw` and never
 * touches process-wide state, so it is safe to call on a CANDIDATE config
 * (admin API dry-run, Phase 02) without affecting the live snapshot — throws
 * `DatasourceConfigInvalidError` with structured issues on the first
 * category of failure that applies.
 */
export function buildConfigSnapshot(raw: unknown, options: BuildSnapshotOptions): ConfigSnapshot {
  const validate = getValidateFn();
  if (!validate(raw)) {
    throw new DatasourceConfigInvalidError(ajvErrorsToIssues(validate.errors));
  }

  const config = raw as DatasourceConfigFile;
  const crossFieldIssues = validateCrossFieldConstraints(config, options.configDir);
  if (crossFieldIssues.length > 0) {
    throw new DatasourceConfigInvalidError(crossFieldIssues.map((message) => ({ path: '', message })));
  }

  const resolvedSecrets = resolveSecretsForEnabledDatasources(config);
  enforceNoMockInProduction(config, options);

  return { config: deepFreeze(config), resolvedSecrets, configDir: options.configDir };
}

/** Resolves `${VAR}`/`*Env` references for enabled datasources only (disabled ones may lack real env vars). */
function resolveSecretsForEnabledDatasources(config: DatasourceConfigFile): ReadonlyMap<string, ResolvedSecrets> {
  const resolved = new Map<string, ResolvedSecrets>();
  for (const ds of config.datasources) {
    if (!ds.enabled) continue;
    try {
      resolved.set(ds.code, resolveTransportSecrets(ds));
    } catch (err) {
      throw new DatasourceConfigInvalidError([
        { path: `datasources/${ds.code}/transport`, message: (err as Error).message },
      ]);
    }
  }
  return resolved;
}

/**
 * Security Considerations (phase-04): mock adapters must be impossible to
 * enable in production. Escape hatch (`ALLOW_MOCK_DATASOURCES=true`) exists
 * for the rare deliberate case (e.g. a demo environment). Enforced on every
 * build (boot AND reload), not just boot.
 */
function enforceNoMockInProduction(config: DatasourceConfigFile, options: BuildSnapshotOptions): void {
  if (options.nodeEnv !== 'production' || options.allowMock) return;

  const mockDatasources = config.datasources.filter((d) => d.enabled && d.transport.kind === 'mock');
  if (mockDatasources.length === 0) return;

  const codes = mockDatasources.map((d) => d.code).join(', ');
  throw new DatasourceConfigInvalidError([
    {
      path: 'datasources',
      message:
        `Refusing to start: NODE_ENV=production but enabled mock datasource(s) present: ${codes}. ` +
        `Set ALLOW_MOCK_DATASOURCES=true to override, or flip transport.kind to "http".`,
    },
  ]);
}

/** Freezes the whole config tree, not just the top level — a nested `datasources[i].input` object was mutable before phase-01. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
