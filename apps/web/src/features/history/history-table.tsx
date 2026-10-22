import { useReactTable, getCoreRowModel, createColumnHelper, flexRender } from '@tanstack/react-table';
import type { QueryLogListItem } from '@shared/index';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatNumber } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { HistoryStatusBadge } from './history-status-badge';

interface HistoryTableProps {
  items: QueryLogListItem[];
  onViewDetail: (id: string) => void;
}

const columnHelper = createColumnHelper<QueryLogListItem>();

/** Tabular list for `GET /history` (S4) — TanStack Table v8, same dependency
 * as Phase 07's `InfoRecordTable` (DRY, no second table library). */
export function HistoryTable({ items, onViewDetail }: HistoryTableProps) {
  const columns = [
    columnHelper.accessor('createdAt', { header: vi.history.columnTime, cell: (c) => formatDateTime(c.getValue()) }),
    columnHelper.accessor('username', { header: vi.history.columnUser }),
    columnHelper.accessor('datasourceCode', { header: vi.history.columnDatasource }),
    // Status (carries the response-code group, e.g. "(2xx)") placed BEFORE
    // the free-text summary column below — review feedback: a long summary
    // forced the row wide enough that status scrolled off-screen and looked
    // like it was missing.
    columnHelper.accessor('status', {
      header: vi.history.columnStatus,
      cell: (c) => <HistoryStatusBadge status={c.getValue()} statusCode={c.row.original.statusCode} />,
    }),
    columnHelper.accessor('recordCount', {
      header: vi.history.columnRecordCount,
      cell: (c) => formatNumber(c.getValue()),
    }),
    columnHelper.accessor('querySummary', {
      header: vi.history.columnSummary,
      cell: (c) => (
        <span className="block max-w-xs truncate" title={c.getValue() ?? undefined}>
          {c.getValue() ?? '—'}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: vi.history.columnActions,
      cell: (c) => (
        <Button variant="outline" size="sm" onClick={() => onViewDetail(c.row.original.id)}>
          {vi.history.viewDetail}
        </Button>
      ),
    }),
  ];

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() });

  if (items.length === 0) {
    return <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">{vi.history.emptyList}</p>;
  }

  return (
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
  );
}
