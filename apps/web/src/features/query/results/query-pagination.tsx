import type { QueryPage } from '@shared/index';
import { Button } from '@/components/ui/button';
import { vi } from '@/i18n/vi';

interface QueryPaginationProps {
  page: QueryPage;
  currentPage: number;
  onPageChange: (page: number) => void;
}

/**
 * Pagination bound to the datasource's own `limits.pageSize` cap (phase-07
 * Implementation Step 13). Records beyond `page.limit` are never reachable
 * by paging further — `TruncationNotice` explains that separately — so the
 * page count is derived from `min(total, limit)`, not `total` alone.
 */
export function QueryPagination({ page, currentPage, onPageChange }: QueryPaginationProps) {
  const effectiveTotal = Math.min(page.total, page.limit);
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / page.pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between">
      <p className="text-muted-foreground text-sm">{vi.query.pageIndicator(currentPage, totalPages, effectiveTotal)}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
          {vi.query.previousPage}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          {vi.query.nextPage}
        </Button>
      </div>
    </div>
  );
}
