import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { DatasourceEntry } from '@app/shared';
import type { ConfigSnapshot, ResolvedHttpSecrets, ResolvedMinioPgSecrets } from '../datasource-config.loader';
import type { DatasourceAdapter } from './datasource-adapter.interface';
import { MockInfoAdapter } from './mock-info.adapter';
import { HttpInfoAdapter } from './http-info.adapter';
import { MinioPgImageAdapter } from './minio-pg-image.adapter';

/** Cap on how long a retired adapter is kept alive before `close()` — never worth leaving a reload-orphaned `pg.Pool` open longer than this. */
const MAX_RETIRE_GRACE_MS = 60_000;

/**
 * `transport.kind` -> adapter instance. The single place that branches on
 * transport kind (phase-04 Architecture) — everything downstream
 * (registry, mapper, controller) only ever sees the `DatasourceAdapter`
 * interface. Phase 01: takes the `ConfigSnapshot` explicitly instead of
 * reading the loader, so a CANDIDATE reload's adapters are built from the
 * candidate snapshot (new secrets/configDir), never from whatever happens
 * to be live at construction time.
 */
@Injectable()
export class AdapterFactory implements OnModuleDestroy {
  private readonly logger = new Logger(AdapterFactory.name);
  private readonly created: DatasourceAdapter[] = [];

  create(datasource: DatasourceEntry, snapshot: ConfigSnapshot): DatasourceAdapter {
    const secrets = snapshot.resolvedSecrets.get(datasource.code);
    let adapter: DatasourceAdapter;

    switch (datasource.transport.kind) {
      case 'mock':
        adapter = new MockInfoAdapter(datasource, snapshot.configDir);
        break;
      case 'http':
        adapter = new HttpInfoAdapter(datasource, (secrets ?? {}) as ResolvedHttpSecrets);
        break;
      case 'minio-pg':
        adapter = new MinioPgImageAdapter(datasource, (secrets ?? {}) as ResolvedMinioPgSecrets);
        break;
      default: {
        const kind: never = datasource.transport;
        throw new Error(`Unsupported transport.kind: ${JSON.stringify(kind)}`);
      }
    }

    this.created.push(adapter);
    return adapter;
  }

  /**
   * Retires adapters replaced by a reload (phase-01 Architecture/Risk
   * Assessment): closed after `graceMs`, not immediately, because in-flight
   * requests hold their own `{config, adapter}` from `registry.get()` taken
   * BEFORE the swap — closing a `minio-pg` adapter's `pg.Pool` out from
   * under one would kill that request's query. Callers should pass
   * `graceMs` based on the retired datasources' own `transport.timeoutMs`
   * (e.g. `2 * timeoutMs`); always clamped to `[0, MAX_RETIRE_GRACE_MS]` so
   * a misconfigured timeout can never leave a `pg.Pool` open indefinitely.
   * Removes each adapter from `created` up front so `onModuleDestroy`
   * never double-closes it — this is also what prevents `created[]` from
   * growing forever across repeated reloads.
   */
  retire(adapters: Iterable<DatasourceAdapter>, graceMs = 5_000): void {
    const delay = Math.min(Math.max(graceMs, 0), MAX_RETIRE_GRACE_MS);
    for (const adapter of adapters) {
      const index = this.created.indexOf(adapter);
      if (index !== -1) this.created.splice(index, 1);

      setTimeout(() => {
        adapter.close?.().catch((err) => this.logger.error('Failed to close retired adapter', err as Error));
      }, delay).unref();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.created.map((adapter) => adapter.close?.()));
  }
}
