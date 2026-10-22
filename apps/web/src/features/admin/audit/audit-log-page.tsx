import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, createColumnHelper, flexRender } from '@tanstack/react-table';
import type { AuditLogEntry } from '@shared/index';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ListPagination } from '@/components/common/list-pagination';
import { formatDateTime } from '@/lib/format';
import { ApiError } from '@/lib/api-client';
import { vi } from '@/i18n/vi';
import { fetchAuditLogs, type AuditLogsListParams } from './audit-api';
import { AuditDiffDialog } from './audit-diff-dialog';

const PAGE_SIZE = 20;
const columnHelper = createColumnHelper<AuditLogEntry>();

/** `/quan-tri/nhat-ky` (S7) — read-only audit trail with before/after diff. */
export function AuditLogPage() {
  const [filters, setFilters] = useState<AuditLogsListParams>({ page: 1, pageSize: PAGE_SIZE });
  const [detailEntry, setDetailEntry] = useState<AuditLogEntry | null>(null);

  const query = useQuery({ queryKey: ['admin-audit-logs', filters], queryFn: () => fetchAuditLogs(filters) });

  const columns = [
    columnHelper.accessor('createdAt', { header: vi.admin.audit.columnTime, cell: (c) => formatDateTime(c.getValue()) }),
    columnHelper.accessor('actorUserId', { header: vi.admin.audit.columnActor, cell: (c) => c.getValue() ?? '—' }),
    columnHelper.accessor('action', { header: vi.admin.audit.columnAction }),
    columnHelper.accessor('targetType', {
      header: vi.admin.audit.columnTarget,
      cell: (c) => `${c.getValue()}${c.row.original.targetId ? ` #${c.row.original.targetId.slice(0, 8)}` : ''}`,
    }),
    columnHelper.display({
      id: 'actions',
      header: vi.admin.audit.columnActions,
      cell: (c) => (
        <Button variant="outline" size="sm" onClick={() => setDetailEntry(c.row.original)}>
          {vi.admin.audit.viewDiff}
        </Button>
      ),
    }),
  ];

  const table = useReactTable({ data: query.data?.items ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{vi.admin.audit.title}</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-filter-actor">{vi.admin.audit.filterActor}</Label>
          <Input
            id="audit-filter-actor"
            value={filters.actorUserId ?? ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, actorUserId: e.target.value || undefined, page: 1 }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-filter-target">{vi.admin.audit.filterTargetType}</Label>
          <Input
            id="audit-filter-target"
            placeholder="user / role"
            value={filters.targetType ?? ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, targetType: e.target.value || undefined, page: 1 }))}
          />
        </div>
      </div>

      {query.isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {query.isError && (
        <p role="alert" className="text-destructive text-sm">
          {query.error instanceof ApiError ? query.error.message : vi.adminCommon.genericError}
        </p>
      )}
      {query.data && (
        <>
          {query.data.items.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">{vi.admin.audit.emptyList}</p>
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <ListPagination
            page={query.data.page}
            pageSize={query.data.pageSize}
            total={query.data.total}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          />
        </>
      )}

      <AuditDiffDialog entry={detailEntry} onOpenChange={(open) => !open && setDetailEntry(null)} />
    </div>
  );
}
