import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { DatasourceEntry } from '@app/shared';
import { DatasourceConfigLoaderService, type ResolvedHttpSecrets, type ResolvedMinioPgSecrets } from '../datasource-config.loader';
import type { DatasourceAdapter } from './datasource-adapter.interface';
import { MockInfoAdapter } from './mock-info.adapter';
import { HttpInfoAdapter } from './http-info.adapter';
import { MinioPgImageAdapter } from './minio-pg-image.adapter';

/**
 * `transport.kind` -> adapter instance. The single place that branches on
 * transport kind (phase-04 Architecture) — everything downstream
 * (registry, mapper, controller) only ever sees the `DatasourceAdapter`
 * interface.
 */
@Injectable()
export class AdapterFactory implements OnModuleDestroy {
  private readonly created: DatasourceAdapter[] = [];

  constructor(private readonly loader: DatasourceConfigLoaderService) {}

  create(datasource: DatasourceEntry): DatasourceAdapter {
    const secrets = this.loader.getResolvedSecrets(datasource.code);
    let adapter: DatasourceAdapter;

    switch (datasource.transport.kind) {
      case 'mock':
        adapter = new MockInfoAdapter(datasource, this.loader.getConfigDir());
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

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.created.map((adapter) => adapter.close?.()));
  }
}
