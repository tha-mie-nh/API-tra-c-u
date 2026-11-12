import {
  QUERY_LOG_FILTER_KEYS,
  QUERY_LOG_NULL_TOKEN,
  buildHistorySearchParams,
  type HistorySortField,
  type QueryLogFilterParams,
} from '@shared/index';
import type { HistoryListParams, HistoryOrder } from './history-api';

export const HISTORY_DEFAULT_PAGE_SIZE = 20;
export const HISTORY_MAX_PAGE_SIZE = 100;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['success', 'failed', 'denied'];
const OUTCOMES = ['answered', 'empty', 'gap'];
const SORTS: HistorySortField[] = ['createdAt', 'durationMs', 'recordCount'];

/** Same shape the server accepts: ISO datetime WITH seconds and an explicit offset (Z | +hh:mm). */
const ISO_WITH_OFFSET = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/** Real calendar date (rejects 2026-02-31). */
function isRealYmd(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isDatetime(v: string): boolean {
  if (YMD.test(v)) return isRealYmd(Number(v.slice(0, 4)), Number(v.slice(5, 7)), Number(v.slice(8, 10)));
  const m = ISO_WITH_OFFSET.exec(v);
  return !!m && isRealYmd(Number(m[1]), Number(m[2]), Number(m[3]));
}
const isUint = (v: string) => /^\d{1,9}$/.test(v);

/** Per-key validators; a value failing its validator is dropped (garbage in URL => ignored). */
const NORMALIZERS: { [K in keyof QueryLogFilterParams]-?: (v: string) => string | undefined } = {
  from: (v) => (isDatetime(v) ? v : undefined),
  to: (v) => (isDatetime(v) ? v : undefined),
  datasourceCode: (v) => v,
  status: (v) => {
    const kept = [...new Set(v.split(',').map((s) => s.trim()))].filter((s) => STATUSES.includes(s));
    return kept.length ? kept.join(',') : undefined;
  },
  outcome: (v) => (OUTCOMES.includes(v) ? v : undefined),
  userId: (v) => v,
  username: (v) => v,
  statusCode: (v) => (v === QUERY_LOG_NULL_TOKEN || /^[1-5]\d\d$/.test(v) ? v : undefined),
  errorCode: (v) => v,
  ip: (v) => v,
  durationMinMs: (v) => (isUint(v) ? v : undefined),
  durationMaxMs: (v) => (isUint(v) ? v : undefined),
  hasRecords: (v) => (v === 'true' || v === 'false' ? v : undefined),
  upstreamRequestId: (v) => v,
  offHours: (v) => (v === 'true' ? v : undefined),
};

/** Filters that only a `history:view_all` caller may use (backend ignores them otherwise). */
export const VIEW_ALL_ONLY_FILTER_KEYS = ['userId', 'username', 'ip'] as const;

export function omitViewAllOnlyFilters<T extends QueryLogFilterParams>(filter: T): T {
  const out = { ...filter };
  for (const key of VIEW_ALL_ONLY_FILTER_KEYS) delete out[key];
  return out;
}

export function pickFilter(source: QueryLogFilterParams): QueryLogFilterParams {
  const out: Record<string, string> = {};
  for (const key of QUERY_LOG_FILTER_KEYS) if (source[key]) out[key] = source[key] as string;
  return out as QueryLogFilterParams;
}

export interface HistoryUrlState {
  params: HistoryListParams;
  /** `?detail=<id>` — row opened in the detail dialog. */
  detail: string | null;
}

function intIn(raw: string | null, min: number, max: number, fallback: number): number {
  const n = raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** URL -> state. Never throws; unknown/garbage values fall back to defaults. */
export function parseHistorySearchParams(sp: URLSearchParams): HistoryUrlState {
  const filter: Record<string, string> = {};
  for (const key of QUERY_LOG_FILTER_KEYS) {
    const raw = sp.get(key)?.trim();
    const value = raw ? NORMALIZERS[key](raw) : undefined;
    if (value) filter[key] = value;
  }
  const sortRaw = sp.get('sort') as HistorySortField | null;
  const orderRaw = sp.get('order');
  return {
    params: {
      ...(filter as QueryLogFilterParams),
      sort: sortRaw && SORTS.includes(sortRaw) ? sortRaw : undefined,
      order: orderRaw === 'asc' || orderRaw === 'desc' ? orderRaw : undefined,
      page: intIn(sp.get('page'), 1, 1000, 1),
      pageSize: intIn(sp.get('pageSize'), 1, HISTORY_MAX_PAGE_SIZE, HISTORY_DEFAULT_PAGE_SIZE),
    },
    detail: sp.get('detail')?.trim() || null,
  };
}

/** State -> URL. Defaults (page 1, size 20, no sort) are omitted to keep links short/stable. */
export function serializeHistorySearchParams(
  params: HistoryListParams,
  detail?: string | null,
): URLSearchParams {
  const sort: HistorySortField | undefined = params.sort;
  const order: HistoryOrder | undefined = params.order;
  return buildHistorySearchParams({
    ...pickFilter(params),
    sort,
    order: sort || order ? order : undefined,
    page: params.page > 1 ? String(params.page) : undefined,
    pageSize: params.pageSize !== HISTORY_DEFAULT_PAGE_SIZE ? String(params.pageSize) : undefined,
    detail: detail ?? undefined,
  });
}
