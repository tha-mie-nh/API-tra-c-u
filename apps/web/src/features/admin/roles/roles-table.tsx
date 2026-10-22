import { useReactTable, getCoreRowModel, createColumnHelper, flexRender } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import type { AdminRole } from '@shared/index';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { vi } from '@/i18n/vi';

interface RolesTableProps {
  items: AdminRole[];
  onEdit: (role: AdminRole) => void;
  onPermissions: (role: AdminRole) => void;
  onDelete: (role: AdminRole) => void;
}

const columnHelper = createColumnHelper<AdminRole>();

/** Roles list (S6) — system roles (`is_system`) cannot be deleted (spec c). */
export function RolesTable({ items, onEdit, onPermissions, onDelete }: RolesTableProps) {
  const columns = [
    columnHelper.accessor('code', { header: vi.admin.roles.columnCode }),
    columnHelper.accessor('name', { header: vi.admin.roles.columnName }),
    columnHelper.accessor('description', { header: vi.admin.roles.columnDescription, cell: (c) => c.getValue() ?? '—' }),
    columnHelper.accessor('isSystem', {
      header: vi.admin.roles.columnSystem,
      cell: (c) => <Badge variant={c.getValue() ? 'secondary' : 'outline'}>{c.getValue() ? vi.admin.roles.systemYes : vi.admin.roles.systemNo}</Badge>,
    }),
    columnHelper.accessor('permissionCodes', {
      header: vi.admin.roles.columnPermissionCount,
      cell: (c) => c.getValue()?.length ?? 0,
    }),
    columnHelper.display({
      id: 'actions',
      header: vi.admin.roles.columnActions,
      cell: (c) => {
        const role = c.row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(role)}>{vi.admin.roles.actionEdit}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onPermissions(role)}>{vi.admin.roles.actionPermissions}</DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={role.isSystem}
                onSelect={() => !role.isSystem && onDelete(role)}
              >
                {role.isSystem ? vi.admin.roles.systemProtected : vi.admin.roles.actionDelete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ];

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() });

  if (items.length === 0) {
    return <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">{vi.admin.roles.emptyList}</p>;
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
