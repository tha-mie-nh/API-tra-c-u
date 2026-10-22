import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatasourceConfigFile } from '@app/shared';
import { validateCrossFieldConstraints } from './config-cross-field-validator';
import { resolveTransportSecrets, type ResolvedSecrets } from './transport-secret-resolver';

export type { ResolvedHttpSecrets, ResolvedMinioPgSecrets, ResolvedSecrets } from './transport-secret-resolver';

// Same depth as apps/api/src/config/app-config.module.ts's ROOT_ENV_PATH:
// src/datasources -> src -> api -> apps -> repo root. Computed from
// __dirname (not process.cwd()) so `pnpm dev` (cwd=apps/api), Docker
// (cwd=/app) and ts-jest (cwd=apps/api) all resolve the same file.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const CONFIG_SCHEMA_PATH = join(REPO_ROOT, 'config', 'config.schema.json');

function loadJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map((e) => `  - ${e.instancePath || '(root)'} ${e.message ?? 'invalid'}`).join('\n');
}

/**
 * Reads + AJV-validates `config.json`, resolves `${ENV}`/`*Env` references
 * from `process.env`, and deep-freezes the result. Runs synchronously in the
 * constructor (not an async lifecycle hook) so a bad config crashes Nest's
 * DI container during bootstrap — "fail fast, not fail silently at query
 * time" (phase-04 Key Insight). Cross-field checks live in
 * `config-cross-field-validator.ts`; secret/env resolution lives in
 * `transport-secret-resolver.ts` — kept out of this file to stay under the
 * project's ~200-line-per-file guideline.
 */
@Injectable()
export class DatasourceConfigLoaderService {
  private readonly logger = new Logger(DatasourceConfigLoaderService.name);
  private readonly config: DatasourceConfigFile;
  private readonly configDir: string;
  private readonly resolvedSecrets = new Map<string, ResolvedSecrets>();

  constructor(private readonly configService: ConfigService) {
    const configPath = this.resolveConfigPath();
    this.configDir = join(configPath, '..');
    this.config = this.loadAndValidate(configPath);
    this.resolveSecretsForEnabledDatasources();
    this.enforceNoMockInProduction();
    Object.freeze(this.config);
    this.logger.log(
      `Loaded ${this.config.datasources.length} datasource(s) from ${configPath}: ${this.config.datasources.map((d) => d.code).join(', ')}`,
    );
  }

  getConfig(): Readonly<DatasourceConfigFile> {
    return this.config;
  }

  /** Directory containing the loaded config.json — `transport.dataFile` (mock adapter) is relative to this, NOT a hardcoded path, so test fixtures can live anywhere. */
  getConfigDir(): string {
    return this.configDir;
  }

  getResolvedSecrets(code: string): ResolvedSecrets | undefined {
    return this.resolvedSecrets.get(code);
  }

  private resolveConfigPath(): string {
    const configured = this.configService.get<string>('APP_CONFIG_PATH') ?? './config/config.json';
    return configured.startsWith('/') ? configured : join(REPO_ROOT, configured.replace(/^\.\//, ''));
  }

  private loadAndValidate(configPath: string): DatasourceConfigFile {
    let raw: unknown;
    try {
      raw = loadJsonFile(configPath);
    } catch (err) {
      throw new Error(`Failed to read/parse config.json at ${configPath}: ${(err as Error).message}`);
    }

    const schema = loadJsonFile(CONFIG_SCHEMA_PATH);
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema as object);
    if (!validate(raw)) {
      const details = formatAjvErrors(validate.errors);
      this.logger.error(`config.json failed schema validation:\n${details}`);
      throw new Error(`config.json failed schema validation against config.schema.json:\n${details}`);
    }

    const config = raw as DatasourceConfigFile;
    const issues = validateCrossFieldConstraints(config);
    if (issues.length > 0) {
      const details = issues.map((i) => `  - ${i}`).join('\n');
      this.logger.error(`config.json failed cross-field validation:\n${details}`);
      throw new Error(`config.json failed cross-field validation:\n${details}`);
    }
    return config;
  }

  /** Resolves `${VAR}`/`*Env` references for enabled datasources only (disabled ones may lack real env vars). */
  private resolveSecretsForEnabledDatasources(): void {
    for (const ds of this.config.datasources) {
      if (!ds.enabled) continue;
      this.resolvedSecrets.set(ds.code, resolveTransportSecrets(ds));
    }
  }

  /**
   * Security Considerations (phase-04): mock adapters must be impossible to
   * enable in production. Escape hatch (`ALLOW_MOCK_DATASOURCES=true`)
   * exists for the rare deliberate case (e.g. a demo environment).
   */
  private enforceNoMockInProduction(): void {
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';
    const allowMock = this.configService.get<string>('ALLOW_MOCK_DATASOURCES') === 'true';
    if (nodeEnv !== 'production' || allowMock) return;

    const mockDatasources = this.config.datasources.filter((d) => d.enabled && d.transport.kind === 'mock');
    if (mockDatasources.length > 0) {
      const codes = mockDatasources.map((d) => d.code).join(', ');
      throw new Error(
        `Refusing to start: NODE_ENV=production but enabled mock datasource(s) present: ${codes}. ` +
          `Set ALLOW_MOCK_DATASOURCES=true to override, or flip transport.kind to "http".`,
      );
    }
  }
}
