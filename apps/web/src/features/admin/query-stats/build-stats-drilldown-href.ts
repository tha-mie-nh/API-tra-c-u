import {
  QUERY_LOG_NULL_TOKEN,
  STATS_COUNTER_HISTORY_FILTER,
  buildHistorySearchParams,
  vnBucketRange,
  type QueryStatsCounterKey,
  type QueryStatsErrorItem,
  type QueryStatsGranularity,
} from '@shared/index';

export const HISTORY_ROUTE = '/lich-su';

/** Range of the stats response ([from, to) ISO UTC) + optional datasource scope. */
export interface DrilldownScope {
  range: { from: string; to: string };
  datasourceCode?: string;
}

export interface DrilldownTarget {
  /** Narrow to one chart bucket (needs `granularity`). */
  bucket?: string;
  granularity?: QueryStatsGranularity;
  counter?: QueryStatsCounterKey;
  errorItem?: Pick<QueryStatsErrorItem, 'errorCode' | 'statusCode'>;
}

/** Bucket clipped to the stats range so edge buckets match the counted rows exactly. */
function clipBucket(scope: DrilldownScope, bucket: string, granularity: QueryStatsGranularity) {
  const b = vnBucketRange(bucket, granularity);
  return {
    from: Date.parse(b.from) < Date.parse(scope.range.from) ? scope.range.from : b.from,
    to: Date.parse(b.to) > Date.parse(scope.range.to) ? scope.range.to : b.to,
  };
}

/**
 * Single source of every "click a number -> Lịch sử" link. Counter filters come
 * from STATS_COUNTER_HISTORY_FILTER so Stats and History totals stay identical.
 */
export function buildStatsDrilldownHref(scope: DrilldownScope, target: DrilldownTarget = {}): string {
  const { bucket, granularity, counter, errorItem } = target;
  const time = bucket && granularity ? clipBucket(scope, bucket, granularity) : scope.range;
  const filter = errorItem
    ? {
        status: 'failed,denied',
        errorCode: errorItem.errorCode ?? QUERY_LOG_NULL_TOKEN,
        statusCode: errorItem.statusCode == null ? QUERY_LOG_NULL_TOKEN : String(errorItem.statusCode),
      }
    : STATS_COUNTER_HISTORY_FILTER[counter ?? 'requests'];
  const qs = buildHistorySearchParams({
    from: time.from,
    to: time.to,
    datasourceCode: scope.datasourceCode,
    ...filter,
  }).toString();
  return `${HISTORY_ROUTE}?${qs}`;
}
