import { Injectable, NotFoundException } from '@nestjs/common';
import type { ZodType } from 'zod';
import type { ClientDatasource, ClientOutputField, DatasourceEntry } from '@app/shared';
import { DatasourceConfigLoaderService, type ConfigSnapshot } from './datasource-config.loader';
import { buildInputSchema } from './input-schema.builder';
import { AdapterFactory } from './adapters/adapter.factory';
import type { DatasourceAdapter } from './adapters/datasource-adapter.interface';

export interface RegistryEntry {
  config: DatasourceEntry;
  inputSchema: ZodType;
  adapter: DatasourceAdapter;
}

/**
 * code -> {config, inputSchema(Zod), adapter}. Built once at boot from
 * `DatasourceConfigLoaderService` (phase-04 Architecture) and rebuilt on
 * reload (phase-01). This is the one object Phase 05's query controller and
 * this phase's `GET /datasources` both read from — `get()`/`getAll()` read
 * `this.entries` fresh on every call, so a `swap()` is visible to the very
 * next request with no further wiring.
 */
@Injectable()
export class DatasourceRegistryService {
  private entries: Map<string, RegistryEntry>;

  constructor(
    private readonly loader: DatasourceConfigLoaderService,
    private readonly adapterFactory: AdapterFactory,
  ) {
    this.entries = this.buildEntries(loader.getSnapshot());
  }

  /** Pure: builds a brand-new entries Map from `snapshot` WITHOUT touching `this.entries` — adapter construction errors (e.g. an unsupported transport.kind) surface here before anything live is touched. */
  buildEntries(snapshot: ConfigSnapshot): Map<string, RegistryEntry> {
    const entries = new Map<string, RegistryEntry>();
    for (const config of snapshot.config.datasources) {
      const inputSchema = buildInputSchema(config.input.fields, config.input.atLeastOneOf, config.input.requireGroups);
      const adapter = this.adapterFactory.create(config, snapshot);
      entries.set(config.code, { config, inputSchema, adapter });
    }
    return entries;
  }

  /** Swaps in an already-built entries Map by single reference assignment and returns the OLD Map so the caller can retire its adapters. */
  swap(entries: Map<string, RegistryEntry>): Map<string, RegistryEntry> {
    const old = this.entries;
    this.entries = entries;
    return old;
  }

  getAll(): DatasourceEntry[] {
    return Array.from(this.entries.values()).map((e) => e.config);
  }

  get(code: string): RegistryEntry {
    const entry = this.entries.get(code);
    if (!entry) {
      throw new NotFoundException({ code: 'DATASOURCE_NOT_FOUND', message: `Unknown datasource "${code}"` });
    }
    return entry;
  }

  /** Datasources the caller may see: enabled + `permissionCode` present in their effective permission set. */
  getForUser(permissions: Set<string>): DatasourceEntry[] {
    return this.getAll().filter((ds) => ds.enabled && permissions.has(ds.permissionCode));
  }

  /**
   * Redacted client projection (reference-config-schema.md design rule #3):
   * built as an explicit whitelist, never `{ ...ds, transport: undefined }`,
   * so a future `transport` sub-key cannot accidentally leak (Security
   * Considerations).
   */
  toClientProjection(ds: DatasourceEntry): ClientDatasource {
    return {
      code: ds.code,
      name: ds.name,
      description: ds.description,
      type: ds.type,
      input: {
        fields: ds.input.fields,
        atLeastOneOf: ds.input.atLeastOneOf,
        requireGroups: ds.input.requireGroups,
      },
      output: {
        fields: ds.output.fields
          .filter((f) => !f.internal)
          .map((f): ClientOutputField => ({
            name: f.name,
            label: f.label,
            type: f.type,
            valueMap: f.valueMap,
            sensitive: f.sensitive,
          })),
      },
      limits: ds.limits ?? { maxResults: 100, pageSize: 20 },
    };
  }
}
