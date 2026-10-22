import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Client as MinioClient } from 'minio';
import type { Response } from 'express';
import type { DatasourceEntry } from '@app/shared';
import { DatasourceRegistryService } from '../datasources/datasource-registry.service';
import { DatasourceConfigLoaderService, type ResolvedMinioPgSecrets } from '../datasources/datasource-config.loader';
import { UpstreamError } from '../datasources/adapters/adapter-errors';

export interface ImageMetadata {
  bucket: string;
  objectKey: string;
  mimeType: string;
}

/**
 * Serves `GET /query/:code/image/:recordId[/thumb]` bytes (phase-05
 * Implementation Step 6-7). The object key is ALWAYS re-resolved
 * server-side from `recordId` via the datasource's own adapter — the client
 * can never name a bucket/key directly (Security Considerations / Risk
 * Assessment: "Client-supplied object key -> arbitrary MinIO object read").
 * Images are streamed through the backend, never a presigned URL
 * (plan.md stack decision) so RBAC + `Cache-Control: private` apply on
 * every single fetch, not just the search that produced the reference.
 */
@Injectable()
export class ImageProxyService {
  private readonly logger = new Logger(ImageProxyService.name);
  private readonly minioClients = new Map<string, MinioClient>();

  constructor(
    private readonly registry: DatasourceRegistryService,
    private readonly loader: DatasourceConfigLoaderService,
  ) {}

  /** Re-resolves {bucket, objectKey, mimeType} for one recordId. Never accepts these from the client. */
  async resolveMetadata(code: string, recordId: string): Promise<ImageMetadata> {
    const { config, adapter } = this.registry.get(code);
    if (config.type !== 'image' || !config.output.imageRef) {
      throw new NotFoundException({ code: 'DATASOURCE_NOT_FOUND', message: `"${code}" is not an image datasource` });
    }
    if (!adapter.getRecordById) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_OPERATION',
        message: 'Image lookup is not supported for this datasource',
      });
    }

    // Any lookup failure — malformed recordId (e.g. not a UUID), a
    // path-traversal / SQL-injection-shaped value that errors the
    // parameterized query, or a genuinely missing row — collapses to the
    // SAME generic 404. Never leak *why* it failed (Security
    // Considerations: no internal detail in error responses) and never let
    // an unmapped adapter error reach the global filter as a raw 500.
    let raw: Awaited<ReturnType<NonNullable<typeof adapter.getRecordById>>>;
    try {
      raw = await adapter.getRecordById(recordId);
    } catch (err) {
      this.logger.warn(`${code}: image record lookup failed for a supplied recordId (treated as not found)`, err as Error);
      throw new NotFoundException({ code: 'IMAGE_NOT_FOUND', message: 'Image not found' });
    }
    if (!raw) {
      throw new NotFoundException({ code: 'IMAGE_NOT_FOUND', message: 'Image not found' });
    }
    return this.extractImageRef(config, raw);
  }

  /**
   * Streams the object bytes to `res`, honoring `If-None-Match` -> 304.
   * `Content-Type`/`ETag` come from the resolved metadata, never the
   * client. Thumbnail route currently calls this with the same object
   * (Implementation Step 7 seam — no speculative resize/cache pipeline
   * until profiling shows a need, per research §B / plan.md YAGNI).
   */
  async streamTo(code: string, metadata: ImageMetadata, res: Response, ifNoneMatch?: string): Promise<void> {
    const client = this.getMinioClient(code);
    const stat = await client.statObject(metadata.bucket, metadata.objectKey);
    const etag = `"${stat.etag}"`;

    if (ifNoneMatch && ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    res.setHeader('Content-Type', metadata.mimeType);
    // NEVER "public" — a shared proxy caching another user's photo would be
    // a cross-user data leak (Security Considerations).
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('ETag', etag);

    const stream = await client.getObject(metadata.bucket, metadata.objectKey);
    stream.pipe(res);
  }

  private extractImageRef(config: DatasourceEntry, raw: Record<string, unknown>): ImageMetadata {
    const imageRef = config.output.imageRef;
    if (!imageRef) {
      throw new UpstreamError(`${config.code}: output.imageRef not configured`, config.code);
    }
    const fieldsByName = new Map(config.output.fields.map((f) => [f.name, f]));

    const readRawValue = (outputFieldName: string): string => {
      const field = fieldsByName.get(outputFieldName);
      const rawKey = field?.from ?? outputFieldName;
      const value = raw[rawKey];
      if (typeof value !== 'string' || value.length === 0) {
        throw new UpstreamError(`${config.code}: image metadata missing "${outputFieldName}"`, config.code);
      }
      return value;
    };

    return {
      bucket: readRawValue(imageRef.bucketField),
      objectKey: readRawValue(imageRef.objectKeyField),
      mimeType: readRawValue(imageRef.mimeField),
    };
  }

  /** One MinIO client per datasource code, built lazily from resolved (never-logged) secrets. */
  private getMinioClient(code: string): MinioClient {
    const existing = this.minioClients.get(code);
    if (existing) return existing;

    const secrets = this.loader.getResolvedSecrets(code) as ResolvedMinioPgSecrets | undefined;
    if (!secrets?.minio) {
      throw new UpstreamError(`${code}: minio connection secrets not resolved`, code);
    }
    const client = new MinioClient({
      endPoint: secrets.minio.endpoint,
      port: secrets.minio.port,
      useSSL: secrets.minio.useSsl,
      accessKey: secrets.minio.accessKey,
      secretKey: secrets.minio.secretKey,
    });
    this.minioClients.set(code, client);
    return client;
  }
}
