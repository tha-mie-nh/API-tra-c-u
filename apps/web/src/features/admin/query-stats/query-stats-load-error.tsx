import { ApiError } from '@/lib/api-client';
import { vi } from '@/i18n/vi';

/** Load failure notice; 422 = too many buckets for the chosen granularity (max 800). */
export function QueryStatsLoadError({ error }: { error: unknown }) {
  const tooMany = error instanceof ApiError && error.status === 422;
  return (
    <p role="alert" className="text-destructive text-sm">
      {tooMany ? vi.admin.queryStats.errTooManyBuckets : vi.admin.queryStats.loadError}
    </p>
  );
}
