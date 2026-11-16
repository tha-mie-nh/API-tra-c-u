import { ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AdminDatasource, AdminDictionary, DatasourceConfigFile, DatasourceEntry, DatasourceEnvRefs } from '@app/shared';
import { DatasourceConfigLoaderService } from '../datasources/datasource-config.loader';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import { AdapterFactory } from '../datasources/adapters/adapter.factory';
import { PermissionSyncService } from '../datasources/permission-sync.service';
import { DatasourceConfigInvalidError } from '../datasources/datasource-config-invalid.error';
import { ConfigWriteMutex } from './config-write-mutex';
import { writeJsonFileAtomically } from './atomic-json-file-writer';
import { listAvailableEnvRefNames } from './datasource-env-name-policy';
import { buildCandidateDatasourceEntry } from './admin-datasource-candidate-entry.builder';
import { toAdminDatasourceProjection } from './admin-datasource-projection.util';

/** How long a retired adapter (replaced by an admin write) is kept alive
 * before `close()` — generous default since admin writes are rare and
 * in-flight requests on the old adapter must never be cut off. */
const RELOAD_GRACE_MS = 5_000;

type MutateResult = { candidate: DatasourceConfigFile; touchedIndex: number | null };

/** Strips the `/datasources/<touchedIndex>` prefix AJV/cross-field issue
 * paths carry, so the admin API returns paths relative to the entry being
 * edited (phase-02 Requirements) instead of leaking array positions that
 * only make sense against the full file. */
function relativizeIssuePath(path: string, touchedIndex: number | null): string {
  const bare = path.replace(/^\//, '');
  if (touchedIndex === null) return bare;
  const prefix = `datasources/${touchedIndex}`;
  if (bare === prefix) return '';
  return bare.startsWith(`${prefix}/`) ? bare.slice(prefix.length + 1) : bare;
}

/**
 * ADMIN-only CRUD + enable/disable + reload-from-disk for `config.json`
 * (phase-02 Architecture). Every mutation: lock -> re-read disk -> mutate a
 * cloned copy -> dry-run validate (AJV + cross-field + secrets + adapter
 * construction, all via Phase 01's `buildSnapshot`/`buildEntries`) -> atomic
 * write -> swap live snapshot/registry -> retire old adapters -> re-sync
 * `api:*` permissions. A candidate that fails validation never reaches the
 * file (every write path validates BEFORE `writeJsonFileAtomically`).
 */
@Injectable()
export class AdminDatasourcesService {
  private readonly logger = new Logger(AdminDatasourcesService.name);
  private readonly mutex = new ConfigWriteMutex();

  constructor(
    private readonly loader: DatasourceConfigLoaderService,
    private readonly registry: DatasourceRegistryService,
    private readonly adapterFactory: AdapterFactory,
    private readonly permissionSync: PermissionSyncService,
  ) {}

  list(): AdminDatasource[] {
    return this.loader.getSourceConfig().datasources.map(toAdminDatasourceProjection);
  }

  envRefs(): DatasourceEnvRefs {
    return listAvailableEnvRefNames();
  }

  get(code: string): AdminDatasource {
    return toAdminDatasourceProjection(this.findEntry(code));
  }

  /** Every dictionary in config.json with the fields that reference it. */
  listDictionaries(): AdminDictionary[] {
    const source = this.loader.getSourceConfig();
    return Object.entries(source.dictionaries ?? {}).map(([name, items]) => ({
      name,
      items: items.map((i) => ({ ...i })),
      usedBy: source.datasources.flatMap((ds) => [
        ...ds.input.fields.filter((f) => f.optionsRef === name).map((f) => ({ datasource: ds.code, field: f.name, kind: 'input' as const })),
        ...ds.output.fields.filter((f) => f.valueMapRef === name).map((f) => ({ datasource: ds.code, field: f.name, kind: 'output' as const })),
      ]),
    }));
  }

  /** Create or replace one dictionary (full validation + live reload via the shared write path). */
  async putDictionary(name: string, items: unknown): Promise<AdminDictionary> {
    if (!Array.isArray(items)) {
      throw new UnprocessableEntityException({ code: 'DICTIONARY_INVALID', message: 'items must be an array of { value, label }' });
    }
    await this.withLockedReload(true, (raw) => {
      raw.dictionaries = { ...(raw.dictionaries ?? {}), [name]: items as { value: string; label: string }[] };
      return { candidate: raw, touchedIndex: null };
    });
    return this.listDictionaries().find((d) => d.name === name) as AdminDictionary;
  }

  async removeDictionary(name: string): Promise<{ name: string }> {
    const dictionary = this.listDictionaries().find((d) => d.name === name);
    if (!dictionary) throw new NotFoundException({ code: 'DICTIONARY_NOT_FOUND', message: `Unknown dictionary "${name}"` });
    if (dictionary.usedBy.length > 0) {
      const where = dictionary.usedBy.map((u) => `${u.datasource}.${u.field}`).join(', ');
      throw new ConflictException({ code: 'DICTIONARY_IN_USE', message: `Danh mục "${name}" đang được dùng bởi: ${where}` });
    }
    await this.withLockedReload(true, (raw) => {
      const rest = { ...(raw.dictionaries ?? {}) };
      delete rest[name];
      raw.dictionaries = rest;
      return { candidate: raw, touchedIndex: null };
    });
    return { name };
  }

  async create(body: unknown): Promise<AdminDatasource> {
    const entry = buildCandidateDatasourceEntry(body, undefined);

    await this.withLockedReload(true, (raw) => {
      if (raw.datasources.some((d) => d.code === entry.code)) {
        throw new ConflictException({ code: 'DATASOURCE_CODE_TAKEN', message: `Datasource "${entry.code}" already exists` });
      }
      raw.datasources.push(entry);
      return { candidate: raw, touchedIndex: raw.datasources.length - 1 };
    });
    return this.get(entry.code);
  }

  async update(code: string, body: unknown): Promise<AdminDatasource> {
    const entry = buildCandidateDatasourceEntry(body, code);

    await this.withLockedReload(true, (raw) => {
      const index = raw.datasources.findIndex((d) => d.code === code);
      if (index === -1) throw this.notFoundError(code);
      raw.datasources[index] = entry;
      return { candidate: raw, touchedIndex: index };
    });
    return this.get(code);
  }

  async setEnabled(code: string, enabled: boolean): Promise<AdminDatasource> {
    await this.withLockedReload(true, (raw) => {
      const index = raw.datasources.findIndex((d) => d.code === code);
      const existing = raw.datasources[index];
      if (index === -1 || !existing) throw this.notFoundError(code);
      raw.datasources[index] = { ...existing, enabled };
      return { candidate: raw, touchedIndex: index };
    });
    return this.get(code);
  }

  async remove(code: string): Promise<{ code: string }> {
    await this.withLockedReload(true, (raw) => {
      const index = raw.datasources.findIndex((d) => d.code === code);
      if (index === -1) throw this.notFoundError(code);
      raw.datasources.splice(index, 1);
      return { candidate: raw, touchedIndex: null };
    });
    return { code };
  }

  /** ADMIN-only escape hatch for hand edits (plan.md Resolved #4): re-reads
   * `config.json` off disk and reloads — same validated-swap path, but
   * never writes (the file is already the source of truth). */
  async reloadFromDisk(): Promise<AdminDatasource[]> {
    await this.withLockedReload(false, (raw) => ({ candidate: raw, touchedIndex: null }));
    return this.list();
  }

  /** Runs one full reload cycle under the write mutex, always re-reading
   * `config.json` from disk first (so a concurrent hand edit is never
   * silently discarded by a stale in-memory copy). `mutate` is pure/sync —
   * it only decides the new candidate file and which entry was touched (for
   * error-path relativization); it may throw `ConflictException`/
   * `NotFoundException` directly, which propagate untouched. */
  private async withLockedReload(
    write: boolean,
    mutate: (raw: DatasourceConfigFile) => MutateResult,
  ): Promise<void> {
    await this.mutex.run(async () => {
      const raw = structuredClone(this.loader.readRawFromDisk()) as DatasourceConfigFile;
      const { candidate, touchedIndex } = mutate(raw);

      const snapshot = this.buildSnapshotOrThrowHttp(candidate, touchedIndex);
      const entries = this.registry.buildEntries(snapshot);

      if (write) {
        try {
          await writeJsonFileAtomically(this.loader.getConfigPath(), candidate);
        } catch (err) {
          const fsCode = (err as NodeJS.ErrnoException).code;
          if (fsCode === 'EROFS' || fsCode === 'EACCES' || fsCode === 'EPERM') {
            this.logger.error(`Cannot write ${this.loader.getConfigPath()}: ${fsCode}`);
            throw new HttpException(
              {
                code: 'CONFIG_NOT_WRITABLE',
                message:
                  'Không ghi được config.json (thư mục config đang read-only hoặc sai quyền). Mount ./config ở chế độ ghi được cho uid 1000.',
              },
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }
          throw err;
        }
      }

      this.loader.applySnapshot(snapshot);
      const oldEntries = this.registry.swap(entries);
      this.adapterFactory.retire(Array.from(oldEntries.values()).map((e) => e.adapter), RELOAD_GRACE_MS);

      await this.permissionSync.sync().catch((err: Error) => {
        this.logger.warn(
          `Permission sync after datasource write failed (datasource is already live, not yet grantable): ${err.message}`,
        );
      });
    });
  }

  private buildSnapshotOrThrowHttp(candidate: DatasourceConfigFile, touchedIndex: number | null) {
    try {
      return this.loader.buildSnapshot(candidate);
    } catch (err) {
      if (err instanceof DatasourceConfigInvalidError) {
        throw new UnprocessableEntityException({
          code: 'DATASOURCE_CONFIG_INVALID',
          message: 'Datasource config is invalid',
          details: err.issues.map((i) => ({ path: relativizeIssuePath(i.path, touchedIndex), message: i.message })),
        });
      }
      throw err;
    }
  }

  private findEntry(code: string): DatasourceEntry {
    const entry = this.loader.getSourceConfig().datasources.find((d) => d.code === code);
    if (!entry) throw this.notFoundError(code);
    return entry;
  }

  private notFoundError(code: string): NotFoundException {
    return new NotFoundException({ code: 'DATASOURCE_NOT_FOUND', message: `Unknown datasource "${code}"` });
  }
}
