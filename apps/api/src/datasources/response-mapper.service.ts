import { Injectable } from '@nestjs/common';
import type { DatasourceEntry, QueryColumn, QueryEnvelope, QueryPage, QueryRecord, QueryRecordGroup } from '@app/shared';
import type { RawRecord } from './adapters/datasource-adapter.interface';
import { parseDateValue, parseWithFormats } from './date-format-parser.util';

export interface MapOptions {
  page?: number;
  pageSize?: number;
  requestId: string;
  tookMs: number;
}

/**
 * Upstream JSON -> unified envelope: rename via `from`, apply `valueMap`,
 * group by `identityField`, sort each group by `timestampField`/`sortOrder`,
 * cap at `limits.maxResults`, set `page.truncated` (phase-04 Implementation
 * Step 12). Pagination model: sort ALL matching records globally by
 * timestamp first, cap at maxResults, THEN slice the requested page, THEN
 * group the page's records by identity for display — keeps "N most recent
 * records across everyone this query matched" behavior instead of
 * paginating per-person groups (simplest model that satisfies the timeline
 * UX; not specified further in reference-config-schema.md).
 */
@Injectable()
export class ResponseMapperService {
  map(rawRecords: RawRecord[], datasource: DatasourceEntry, options: MapOptions): QueryEnvelope {
    const mapped = this.sortByTimestamp(rawRecords, datasource);

    const total = mapped.length;
    const limit = datasource.limits?.maxResults ?? 100;
    const capped = mapped.slice(0, limit);
    const truncated = total > limit;

    const pageSize = Math.min(options.pageSize ?? datasource.limits?.pageSize ?? 20, datasource.limits?.pageSize ?? 20);
    const page = Math.max(options.page ?? 1, 1);
    const start = (page - 1) * pageSize;
    const pageRecords = capped.slice(start, start + pageSize);

    return {
      datasource: datasource.code,
      type: datasource.type,
      requestId: options.requestId,
      columns: this.buildColumns(datasource),
      timestampField: datasource.output.timestampField,
      groups: this.groupByIdentity(pageRecords, datasource),
      page: {
        page,
        pageSize,
        total,
        returned: pageRecords.length,
        limit,
        truncated,
      } satisfies QueryPage,
      tookMs: options.tookMs,
    };
  }

  /** Strips `internal` output fields before an envelope is ever serialized to an HTTP client (Phase 05). */
  toClientEnvelope(envelope: QueryEnvelope, datasource: DatasourceEntry): QueryEnvelope {
    const internalNames = new Set(datasource.output.fields.filter((f) => f.internal).map((f) => f.name));
    if (internalNames.size === 0) return envelope;

    const strip = (record: QueryRecord): QueryRecord =>
      Object.fromEntries(Object.entries(record).filter(([key]) => !internalNames.has(key)));

    return {
      ...envelope,
      columns: envelope.columns.filter((c) => !internalNames.has(c.name)),
      groups: envelope.groups.map((g) => ({ ...g, records: g.records.map(strip) })),
    };
  }

  private mapOne(raw: RawRecord, datasource: DatasourceEntry): QueryRecord {
    const mapped: QueryRecord = {};
    for (const field of datasource.output.fields) {
      let rawValue = field.from ? raw[field.from] : raw[field.name];
      if ((field.type === 'date' || field.type === 'datetime') && typeof rawValue === 'string' && rawValue !== '') {
        rawValue = parseWithFormats(rawValue, field.format) ?? rawValue;
      }
      mapped[field.name] = field.valueMap && rawValue !== undefined ? (field.valueMap[String(rawValue)] ?? rawValue) : rawValue;
    }
    return mapped;
  }

  /** Maps then sorts by the timestamp field. The sort key is derived from the RAW upstream value (via the
   * field's `format`) so sorting works even when the field is declared `string` or the value isn't ISO. */
  private sortByTimestamp(rawRecords: RawRecord[], datasource: DatasourceEntry): QueryRecord[] {
    const { timestampField, sortOrder } = datasource.output;
    const direction = sortOrder === 'asc' ? 1 : -1;
    const tsField = datasource.output.fields.find((f) => f.name === timestampField);
    const keyed = rawRecords.map((raw) => {
      const rawValue = tsField ? (tsField.from ? raw[tsField.from] : raw[tsField.name]) : undefined;
      return { record: this.mapOne(raw, datasource), key: this.toComparableTime(rawValue, tsField?.format) };
    });
    keyed.sort((a, b) => (a.key - b.key) * direction);
    return keyed.map((k) => k.record);
  }

  private toComparableTime(value: unknown, format?: string): number {
    if (typeof value !== 'string') return 0;
    const iso = parseDateValue(value, format);
    const time = iso ? new Date(iso).getTime() : Number.NaN;
    return Number.isNaN(time) ? 0 : time;
  }

  private groupByIdentity(records: QueryRecord[], datasource: DatasourceEntry): QueryRecordGroup[] {
    const { identityField } = datasource.output;
    const groups = new Map<string, QueryRecordGroup>();

    for (const record of records) {
      const identity = String(record[identityField] ?? '');
      let group = groups.get(identity);
      if (!group) {
        group = { identity, label: this.deriveLabel(record, identity), records: [] };
        groups.set(identity, group);
      }
      group.records.push(record);
    }
    return Array.from(groups.values());
  }

  /** Best-effort display label: prefer a `fullName` field if the datasource has one, else fall back to the identity. */
  private deriveLabel(record: QueryRecord, identity: string): string {
    const fullName = record.fullName;
    return typeof fullName === 'string' && fullName.length > 0 ? fullName : identity;
  }

  private buildColumns(datasource: DatasourceEntry): QueryColumn[] {
    return datasource.output.fields.map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      ...(f.emphasize ? { emphasize: f.emphasize } : {}),
      ...(f.iconMap ? { iconMap: f.iconMap } : {}),
      ...(f.headerField ? { headerField: f.headerField } : {}),
      ...(f.displayFormat ? { displayFormat: f.displayFormat } : {}),
    }));
  }
}
