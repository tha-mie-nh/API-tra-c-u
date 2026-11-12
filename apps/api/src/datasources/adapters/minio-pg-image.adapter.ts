import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import type { DatasourceEntry, TransportMinioPg } from '@app/shared';
import type { ResolvedMinioPgSecrets } from '../datasource-config.loader';
import type { AdapterExecuteInput, AdapterExecuteResult, DatasourceAdapter, RawRecord } from './datasource-adapter.interface';
import { UpstreamError } from './adapter-errors';
import { localExchange } from './upstream-exchange.util';
import { withTimeout } from './with-timeout.util';

/**
 * Queries the (separately owned) image metadata Postgres via
 * `transport.query` — always parameterized ($1, $2, ...), never string
 * interpolation (Security Considerations). Returns row metadata only; Phase
 * 05's image-serving endpoint streams the actual bytes from MinIO using
 * `bucket`/`objectKey`.
 */
export class MinioPgImageAdapter implements DatasourceAdapter {
  private readonly logger = new Logger(MinioPgImageAdapter.name);
  private readonly transport: TransportMinioPg;
  private pool: Pool | null = null;

  constructor(
    private readonly datasource: DatasourceEntry,
    private readonly secrets: ResolvedMinioPgSecrets,
  ) {
    if (datasource.transport.kind !== 'minio-pg') {
      throw new Error(`MinioPgImageAdapter requires transport.kind=minio-pg, got "${datasource.transport.kind}"`);
    }
    this.transport = datasource.transport;
  }

  async execute(input: AdapterExecuteInput): Promise<AdapterExecuteResult> {
    const timeoutMs = this.transport.timeoutMs ?? 10_000;
    return withTimeout(this.run(input), timeoutMs, this.datasource.code);
  }

  private async run(input: AdapterExecuteInput): Promise<AdapterExecuteResult> {
    // Exactly one input field is expected for the image datasource (the
    // identity lookup key, e.g. citizenId); its mapped value becomes $1.
    const identityField = this.datasource.input.fields[0];
    if (!identityField) {
      throw new UpstreamError(`${this.datasource.code}: no input field configured`, this.datasource.code);
    }
    const identityValue = input.params[identityField.name];
    const limit = Math.min(input.pageSize ?? this.datasource.limits?.pageSize ?? 20, this.datasource.limits?.maxResults ?? 100);

    const started = Date.now();
    const sent = { [identityField.name]: identityValue, limit };
    try {
      const pool = this.getPool();
      const result = await pool.query(this.transport.query, [identityValue, limit]);
      const rows = result.rows as RawRecord[];
      return {
        records: rows,
        total: result.rowCount ?? rows.length,
        exchange: localExchange('minio-pg', sent, { durationMs: Date.now() - started, body: { rows } }),
      };
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      throw new UpstreamError(`${this.datasource.code}: image DB query failed`, this.datasource.code, err,
        localExchange('minio-pg', sent, { durationMs: Date.now() - started, error: (err as Error).message }));
    }
  }

  /**
   * Phase 05: `ImageProxyService`'s only way to turn a client-supplied
   * `recordId` into `{bucket, objectKey, mimeType}` — always a parameterized
   * point lookup via `transport.recordQuery`, never string interpolation and
   * never a client-supplied bucket/key (Security Considerations).
   */
  async getRecordById(recordId: string): Promise<RawRecord | null> {
    if (!this.transport.recordQuery) {
      throw new UpstreamError(`${this.datasource.code}: transport.recordQuery not configured`, this.datasource.code);
    }
    try {
      const pool = this.getPool();
      const result = await pool.query(this.transport.recordQuery, [recordId]);
      return (result.rows[0] as RawRecord | undefined) ?? null;
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      throw new UpstreamError(`${this.datasource.code}: image record lookup failed`, this.datasource.code, err);
    }
  }

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({ connectionString: this.secrets.pgUrl, max: 5 });
      this.pool.on('error', (err) => this.logger.error(`Idle pg client error for ${this.datasource.code}`, err));
    }
    return this.pool;
  }

  async close(): Promise<void> {
    await this.pool?.end();
    this.pool = null;
  }
}
