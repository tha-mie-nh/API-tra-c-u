import { Button } from '@/components/ui/button';
import { vi } from '@/i18n/vi';

interface ListPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/**
 * Plain prev/next pagination for server-paginated admin lists (Users, Roles'
 * audit log, History) — same interaction pattern as
 * `features/query/results/query-pagination.tsx` (Phase 07) but generic over
 * `{page,pageSize,total}` since admin/history responses have no
 * `page.limit` truncation concept, unlike `QueryEnvelope`.
 */
export function ListPagination({ page, pageSize, total, onPageChange }: ListPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between">
      <p className="text-muted-foreground text-sm">
        {vi.adminCommon.page} {page}/{totalPages} — {vi.adminCommon.total(total)}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          {vi.query.previousPage}
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          {vi.query.nextPage}
        </Button>
      </div>
    </div>
  );
}
