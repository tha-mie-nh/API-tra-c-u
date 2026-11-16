import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatasourceConfigFile } from '@app/shared';
import { validateCrossFieldConstraints } from './config-cross-field-validator';
import { resolveTransportSecrets, type ResolvedSecrets } from './transport-secret-resolver';
import { DatasourceConfigInvalidError, type DatasourceConfigIssue } from './datasource-config-invalid.error';

/** Immutable result of validating one candidate config — never mutated after `buildConfigSnapshot` returns it. */
export interface ConfigSnapshot {
  /** Runtime view: dictionary refs (`optionsRef`/`valueMapRef`) already inlined into `options`/`valueMap`. */
  readonly config: DatasourceConfigFile;
  /** The validated config exactly as written in config.json (refs intact) — what the admin UI shows and edits. */
  readonly source: DatasourceConfigFile;
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
/**
 * The schema belongs to the CODE (the DSL it validates is implemented here), not to the operator's mounted `config/`
 * directory. The Docker image therefore carries its own copy (`/repo/schema/config.schema.json`) and that copy wins:
 * a stale `config.schema.json` left in a mounted config dir by an earlier release used to reject every key added since
 * ("must NOT have additional properties" on Lưu). In dev there is no bundled copy, so the repo's `config/` one is used.
 * `CONFIG_SCHEMA_PATH` overrides both.
 */
const BUNDLED_SCHEMA_PATH = join(REPO_ROOT, 'schema', 'config.schema.json');
export const CONFIG_SCHEMA_PATH =
  process.env.CONFIG_SCHEMA_PATH ?? (existsSync(BUNDLED_SCHEMA_PATH) ? BUNDLED_SCHEMA_PATH : join(REPO_ROOT, 'config', 'config.schema.json'));

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

  const resolved = resolveRuntimeConfig(config);
  return { config: deepFreeze(resolved), source: deepFreeze(config), resolvedSecrets, configDir: options.configDir };
}

/**
 * Runtime copy of `config`: every `optionsRef` / `valueMapRef` replaced by the dictionary's content, and the
 * file's `defaults` (retry, timeoutMs, maxResults, pageSize) applied wherever a datasource/transport leaves them
 * out. Without the latter `defaults.retry` was dead config: a datasource with no `transport.retry` got ZERO
 * retries, so one reset socket or 503 from the upstream surfaced as an error on the user's first click.
 */
function resolveRuntimeConfig(config: DatasourceConfigFile): DatasourceConfigFile {
  const resolved = structuredClone(config);
  const dictionaries = resolved.dictionaries ?? {};
  const { defaults } = resolved;
  for (const ds of resolved.datasources) {
    ds.limits ??= { maxResults: defaults.maxResults, pageSize: defaults.pageSize };
    if (ds.transport.kind === 'http') {
      ds.transport.timeoutMs ??= defaults.timeoutMs;
      ds.transport.retry ??= { ...defaults.retry };
    }
    for (const field of ds.input.fields) {
      if (field.optionsRef) field.options = dictionaries[field.optionsRef]?.map((o) => ({ ...o })) ?? [];
    }
    for (const field of ds.output.fields) {
      if (field.valueMapRef) {
        field.valueMap = Object.fromEntries((dictionaries[field.valueMapRef] ?? []).map((o) => [o.value, o.label]));
      }
    }
  }
  return resolved;
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
