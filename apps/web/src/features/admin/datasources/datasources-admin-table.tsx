import { useReactTable, getCoreRowModel, createColumnHelper, flexRender } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import type { AdminDatasource } from '@shared/index';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { vi } from '@/i18n/vi';

interface DatasourcesAdminTableProps {
  items: AdminDatasource[];
  onToggle: (entry: AdminDatasource, enabled: boolean) => void;
  onEdit: (entry: AdminDatasource) => void;
  onDelete: (entry: AdminDatasource) => void;
}

const columnHelper = createColumnHelper<AdminDatasource>();

/** `apiKeyEnvSet`/`baseUrlEnvSet === false` (referenced but unset on THIS
 * instance) shows the DevOps warning (phase-03 Requirements); `null` means
 * "not applicable" and shows nothing. */
function EnvStatusBadge({ entry }: { entry: AdminDatasource }) {
  const { apiKeyEnvSet, baseUrlEnvSet } = entry.envStatus;
  const missing = apiKeyEnvSet === false || baseUrlEnvSet === false;
  if (apiKeyEnvSet === null && baseUrlEnvSet === null) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={missing ? 'destructive' : 'secondary'}>
      {missing ? vi.admin.datasources.envMissing : vi.admin.datasources.envOk}
    </Badge>
  );
}

/** Admin datasources list (phase-03) — toggle switch per row drives `PATCH
 * .../enabled` directly; create/edit go through `DatasourceFormDialog`. */
export function DatasourcesAdminTable({ items, onToggle, onEdit, onDelete }: DatasourcesAdminTableProps) {
  const t = vi.admin.datasources;
  const columns = [
    columnHelper.accessor('code', { header: t.columnCode }),
    columnHelper.accessor('name', { header: t.columnName }),
    columnHelper.accessor('type', { header: t.columnType }),
    columnHelper.display({
      id: 'transport',
      header: t.columnTransport,
      cell: (c) => (c.row.original.transport as { kind: string }).kind,
    }),
    columnHelper.accessor('enabled', {
      header: t.columnEnabled,
      cell: (c) => {
        const entry = c.row.original;
        return <Switch checked={entry.enabled} onCheckedChange={(checked) => onToggle(entry, checked === true)} />;
      },
    }),
    columnHelper.display({
      id: 'envStatus',
      header: t.columnEnv,
      cell: (c) => <EnvStatusBadge entry={c.row.original} />,
    }),
    columnHelper.display({
      id: 'actions',
      header: t.columnActions,
      cell: (c) => {
        const entry = c.row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(entry)}>{t.actionEdit}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(entry)}>
                {t.actionDelete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ];

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() });

  if (items.length === 0) {
    return <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">{t.emptyList}</p>;
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
