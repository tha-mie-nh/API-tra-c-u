import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatasourceConfigFile } from '@app/shared';
import { buildConfigSnapshot, type ConfigSnapshot } from './config-snapshot-builder';
import { DatasourceConfigInvalidError, formatIssues } from './datasource-config-invalid.error';
import type { ResolvedSecrets } from './transport-secret-resolver';

export type { ResolvedHttpSecrets, ResolvedMinioPgSecrets, ResolvedSecrets } from './transport-secret-resolver';
export type { ConfigSnapshot } from './config-snapshot-builder';

// Same depth as apps/api/src/config/app-config.module.ts's ROOT_ENV_PATH:
// src/datasources -> src -> api -> apps -> repo root. Computed from
// __dirname (not process.cwd()) so `pnpm dev` (cwd=apps/api), Docker
// (cwd=/app) and ts-jest (cwd=apps/api) all resolve the same file.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

function loadJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Reads + AJV-validates `config.json`, resolves `${ENV}`/`*Env` references
 * from `process.env`, and deep-freezes the result into an immutable
 * `ConfigSnapshot` (built by `config-snapshot-builder.ts`). Boot runs this
 * synchronously in the constructor (not an async lifecycle hook) so a bad
 * config crashes Nest's DI container during bootstrap — "fail fast, not
 * fail silently at query time" (phase-04 Key Insight) — unchanged by
 * phase-01. What's new: `buildSnapshot()`/`applySnapshot()` let a CANDIDATE
 * config be validated and swapped in without a process restart — every
 * getter below reads `this.snapshot`, so once it's reassigned every
 * consumer (all of which call these getters per-request, never caching the
 * result) sees the new config with no further wiring (phase-01 Key
 * Insight).
 */
@Injectable()
export class DatasourceConfigLoaderService {
  private readonly logger = new Logger(DatasourceConfigLoaderService.name);
  private readonly configPath: string;
  private readonly configDir: string;
  private readonly nodeEnv: string;
  private readonly allowMock: boolean;
  private snapshot: ConfigSnapshot;

  constructor(private readonly configService: ConfigService) {
    this.configPath = this.resolveConfigPath();
    this.configDir = join(this.configPath, '..');
    this.nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';
    this.allowMock = this.configService.get<string>('ALLOW_MOCK_DATASOURCES') === 'true';
    this.snapshot = this.loadAtBoot();
    this.logger.log(
      `Loaded ${this.snapshot.config.datasources.length} datasource(s) from ${this.configPath}: ` +
        `${this.snapshot.config.datasources.map((d) => d.code).join(', ')}`,
    );
  }

  getConfig(): Readonly<DatasourceConfigFile> {
    return this.snapshot.config;
  }

  /** Directory containing the loaded config.json — `transport.dataFile` (mock adapter) is relative to this, NOT a hardcoded path, so test fixtures can live anywhere. */
  getConfigDir(): string {
    return this.snapshot.configDir;
  }

  getConfigPath(): string {
    return this.configPath;
  }

  getResolvedSecrets(code: string): ResolvedSecrets | undefined {
    return this.snapshot.resolvedSecrets.get(code);
  }

  /** The full current snapshot — used by `DatasourceRegistryService`/`AdapterFactory` so candidate adapters are always built from the snapshot being applied, never from whatever happens to be live at the time (phase-01 Architecture). */
  getSnapshot(): ConfigSnapshot {
    return this.snapshot;
  }

  /** Reads the raw, un-validated config.json off disk. Throws a plain `Error` (not `DatasourceConfigInvalidError`) on read/parse failure — mirrors the pre-phase-01 behavior for this specific failure mode. */
  readRawFromDisk(): unknown {
    try {
      return loadJsonFile(this.configPath);
    } catch (err) {
      throw new Error(`Failed to read/parse config.json at ${this.configPath}: ${(err as Error).message}`);
    }
  }

  /** Pure: validates `raw` and returns a new snapshot WITHOUT touching `this.snapshot`. Throws `DatasourceConfigInvalidError` on any failure — callers must catch and MUST NOT call `applySnapshot` on failure. */
  buildSnapshot(raw: unknown): ConfigSnapshot {
    return buildConfigSnapshot(raw, { configDir: this.configDir, nodeEnv: this.nodeEnv, allowMock: this.allowMock });
  }

  /** Swaps in an already-validated snapshot by single reference assignment — the only mutation this class ever performs after boot. */
  applySnapshot(snapshot: ConfigSnapshot): void {
    this.snapshot = snapshot;
    this.logger.log(
      `Applied config snapshot: ${snapshot.config.datasources.length} datasource(s): ` +
        `${snapshot.config.datasources.map((d) => d.code).join(', ')}`,
    );
  }

  private loadAtBoot(): ConfigSnapshot {
    const raw = this.readRawFromDisk();
    try {
      return this.buildSnapshot(raw);
    } catch (err) {
      if (err instanceof DatasourceConfigInvalidError) {
        const details = formatIssues(err.issues);
        this.logger.error(`config.json failed validation:\n${details}`);
        throw new Error(`config.json failed validation:\n${details}`);
      }
      throw err;
    }
  }

  private resolveConfigPath(): string {
    const configured = this.configService.get<string>('APP_CONFIG_PATH') ?? './config/config.json';
    return configured.startsWith('/') ? configured : join(REPO_ROOT, configured.replace(/^\.\//, ''));
  }
}
