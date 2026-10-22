import { Injectable, NotFoundException } from '@nestjs/common';
import type { ZodType } from 'zod';
import type { ClientDatasource, ClientOutputField, DatasourceEntry } from '@app/shared';
import { DatasourceConfigLoaderService } from './datasource-config.loader';
import { buildInputSchema } from './input-schema.builder';
import { AdapterFactory } from './adapters/adapter.factory';
import type { DatasourceAdapter } from './adapters/datasource-adapter.interface';

interface RegistryEntry {
  config: DatasourceEntry;
  inputSchema: ZodType;
  adapter: DatasourceAdapter;
}

/**
 * code -> {config, inputSchema(Zod), adapter}. Built once at boot from
 * `DatasourceConfigLoaderService` (phase-04 Architecture). This is the one
 * object Phase 05's query controller and this phase's `GET /datasources`
 * both read from.
 */
@Injectable()
export class DatasourceRegistryService {
  private readonly entries = new Map<string, RegistryEntry>();

  constructor(
    private readonly loader: DatasourceConfigLoaderService,
    private readonly adapterFactory: AdapterFactory,
  ) {
    for (const config of loader.getConfig().datasources) {
      const inputSchema = buildInputSchema(config.input.fields, config.input.atLeastOneOf, config.input.requireGroups);
      const adapter = this.adapterFactory.create(config);
      this.entries.set(config.code, { config, inputSchema, adapter });
    }
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
