import type { QueryPage } from '@shared/index';
import { vi } from '@/i18n/vi';

/** Spec (g): visible banner when the result set was capped by the
 * datasource's `limits.maxResults` (phase-07 Implementation Step 11). */
export function TruncationNotice({ page }: { page: QueryPage }) {
  if (!page.truncated) return null;
  return (
    <div
      role="status"
      className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      {vi.query.truncationNotice(page.limit)}
    </div>
  );
}
