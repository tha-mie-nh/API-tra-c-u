import { Skeleton } from '@/components/ui/skeleton';
import { vi } from '@/i18n/vi';

/** Loading skeleton shown while a lookup mutation is pending (phase-07
 * Implementation Step 12) — visually distinct from the empty/error states. */
export function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

/** "No results" — distinct from an error (spec: empty state vs upstream error). */
export function EmptyState() {
  return (
    <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
      {vi.query.emptyResults}
    </div>
  );
}

/** Validation (422)/forbidden(403)/upstream(502/504)/rate-limit(429) errors,
 * already translated to Vietnamese by `query-error-message.ts`. */
export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-4 text-sm">
      {message}
    </div>
  );
}
