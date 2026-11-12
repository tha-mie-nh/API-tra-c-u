import type {
  QueryStatsBucket,
  QueryStatsCounters,
  QueryStatsDatasourceRow,
  QueryStatsErrorItem,
} from '@app/shared';
import type { RawBucketRow, RawCounterRow, RawDatasourceRow, RawErrorRow } from './query-stats-sql.repository';

export const ZERO_RAW: RawCounterRow = {
  requests: 0,
  answered: 0,
  success: 0,
  failed: 0,
  denied: 0,
  records: 0,
  avg_duration_ms: null,
  duration_sum_ms: 0,
  duration_count: 0,
};

/** Raw SQL row -> API counters; derives gap / empty / errors. */
export function toCounters(row: RawCounterRow): QueryStatsCounters {
  return {
    requests: row.requests,
    answered: row.answered,
    gap: row.requests - row.answered,
    success: row.success,
    empty: row.success - row.answered,
    failed: row.failed,
    denied: row.denied,
    errors: row.failed + row.denied,
    records: row.records,
    avgDurationMs: row.avg_duration_ms,
  };
}

/** Sum of per-datasource rows; avg duration = exact total duration / number of rows that HAVE a duration. */
export function sumRaw(rows: RawCounterRow[]): RawCounterRow {
  const total = { ...ZERO_RAW };
  for (const r of rows) {
    total.requests += r.requests;
    total.answered += r.answered;
    total.success += r.success;
    total.failed += r.failed;
    total.denied += r.denied;
    total.records += r.records;
    total.duration_sum_ms += r.duration_sum_ms;
    total.duration_count += r.duration_count;
  }
  total.avg_duration_ms = total.duration_count > 0 ? Math.round(total.duration_sum_ms / total.duration_count) : null;
  return total;
}

/** Overview rows: every configured datasource (0 if no traffic) + orphan codes found only in logs. Sorted requests DESC. */
export function mergeDatasourceRows(
  raw: RawDatasourceRow[],
  configured: { code: string; name: string }[],
): QueryStatsDatasourceRow[] {
  const byCode = new Map(raw.map((r) => [r.datasource_code, r]));
  const rows: QueryStatsDatasourceRow[] = configured.map((ds) => ({
    datasourceCode: ds.code,
    name: ds.name,
    ...toCounters(byCode.get(ds.code) ?? ZERO_RAW),
  }));
  const known = new Set(configured.map((c) => c.code));
  for (const r of raw) {
    if (!known.has(r.datasource_code)) {
      rows.push({ datasourceCode: r.datasource_code, name: null, ...toCounters(r) });
    }
  }
  return rows.sort((a, b) => b.requests - a.requests || a.datasourceCode.localeCompare(b.datasourceCode));
}

/** One bucket per key (zero-filled) so charts are continuous. */
export function fillTimeseries(raw: RawBucketRow[], keys: string[]): QueryStatsBucket[] {
  const byKey = new Map(raw.map((r) => [r.bucket, r]));
  return keys.map((bucket) => ({ bucket, ...toCounters(byKey.get(bucket) ?? ZERO_RAW) }));
}

export function toErrorItems(rows: RawErrorRow[]): QueryStatsErrorItem[] {
  return rows.map((r) => ({ errorCode: r.error_code, statusCode: r.status_code, count: r.count }));
}
