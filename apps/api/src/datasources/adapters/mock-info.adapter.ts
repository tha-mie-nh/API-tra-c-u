import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatasourceEntry, TransportMock } from '@app/shared';
import type { AdapterExecuteInput, AdapterExecuteResult, DatasourceAdapter, RawRecord } from './datasource-adapter.interface';
import { UpstreamError } from './adapter-errors';
import { withTimeout } from './with-timeout.util';

/** Magic input values (any string field) that exercise error/timeout UI paths without a real upstream. */
const MAGIC_FAIL_VALUE = '__FAIL__';
const MAGIC_SLOW_VALUE = '__SLOW__';

/**
 * Stand-in for an undocumented upstream "citizen info" API. Reads a static
 * fixture (`transport.dataFile`) and filters in-memory by the datasource's
 * own `input.fields[].mapTo` — genuinely different field names per
 * datasource, proving the engine isn't hardcoded to one shape (phase-04 Risk
 * Assessment: "mỗi API 1 input/output khác nhau").
 */
export class MockInfoAdapter implements DatasourceAdapter {
  private readonly logger = new Logger(MockInfoAdapter.name);
  private readonly transport: TransportMock;
  private cachedRecords: RawRecord[] | null = null;

  constructor(
    private readonly datasource: DatasourceEntry,
    private readonly configDir: string,
  ) {
    if (datasource.transport.kind !== 'mock') {
      throw new Error(`MockInfoAdapter requires transport.kind=mock, got "${datasource.transport.kind}"`);
    }
    this.transport = datasource.transport;
  }

  async execute(input: AdapterExecuteInput): Promise<AdapterExecuteResult> {
    return withTimeout(this.run(input), this.transport.timeoutMs ?? 10_000, this.datasource.code);
  }

  private async run(input: AdapterExecuteInput): Promise<AdapterExecuteResult> {
    await this.applyMagicValues(input.params);

    const records = this.loadRecords();
    const matched = records.filter((record) => this.matches(record, input.params));

    this.logger.debug(`${this.datasource.code}: matched ${matched.length}/${records.length} mock record(s)`);
    return { records: matched, total: matched.length, requestId: `mock_${randomUUID()}` };
  }

  /**
   * Injectable failure/slowness so error and timeout UI states can be built
   * and tested without a real upstream (phase-04 Implementation Step 9): any
   * string input field set to `__FAIL__` throws immediately; `__SLOW__`
   * sleeps past `transport.timeoutMs`, letting `withTimeout()` above turn it
   * into an `UpstreamTimeoutError`.
   */
  private async applyMagicValues(params: Record<string, unknown>): Promise<void> {
    const values = Object.values(params);
    if (values.includes(MAGIC_FAIL_VALUE)) {
      throw new UpstreamError(`${this.datasource.code}: mock adapter injected failure (magic value)`, this.datasource.code);
    }
    if (values.includes(MAGIC_SLOW_VALUE)) {
      const timeoutMs = this.transport.timeoutMs ?? 10_000;
      await new Promise((resolve) => setTimeout(resolve, timeoutMs + 1000));
    }
  }

  private loadRecords(): RawRecord[] {
    if (this.cachedRecords) return this.cachedRecords;
    const path = join(this.configDir, this.transport.dataFile);
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as RawRecord[];
    this.cachedRecords = raw;
    return raw;
  }

  private matches(record: RawRecord, params: Record<string, unknown>): boolean {
    for (const field of this.datasource.input.fields) {
      const value = params[field.name];
      if (value === undefined || value === null || value === '') continue;

      if (value === MAGIC_SLOW_VALUE) {
        // Handled below via an artificial delay path; treat as a match so the
        // slow branch actually returns data once the delay resolves.
        continue;
      }

      const upstreamKey = field.mapTo ?? field.name;
      const recordValue = record[upstreamKey];
      if (recordValue === undefined) return false;

      // Exact match only — partial input (e.g. "012" for a "0123456"
      // citizenId, or a truncated name) must NEVER return a sample record.
      // Case-insensitive for strings only (free-text fields like fullName
      // can differ in case while still being the same value).
      if (field.type === 'string' && typeof recordValue === 'string' && typeof value === 'string') {
        if (recordValue.toLowerCase() !== value.toLowerCase()) return false;
      } else if (String(recordValue) !== String(value)) {
        return false;
      }
    }
    return true;
  }
}
