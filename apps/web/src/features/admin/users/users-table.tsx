import { useReactTable, getCoreRowModel, createColumnHelper, flexRender } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import type { AdminUser } from '@shared/index';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDateTime } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { UserStatusBadge } from './user-status-badge';

interface UsersTableProps {
  items: AdminUser[];
  /** Row whose "Khóa"/"Gán vai trò"/"Xóa" actions must be hidden — the
   * backend hard-blocks all 3 for self too, but hiding here avoids the
   * confirm-dialog round trip for an action that can never succeed. */
  currentUserId?: string;
  onEdit: (user: AdminUser) => void;
  onLock: (user: AdminUser) => void;
  onUnlock: (user: AdminUser) => void;
  onAssignRoles: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
}

const columnHelper = createColumnHelper<AdminUser>();

/** Users list (S5) — TanStack Table v8, same as history/query tables (DRY). */
export function UsersTable({ items, currentUserId, onEdit, onLock, onUnlock, onAssignRoles, onResetPassword, onDelete }: UsersTableProps) {
  const columns = [
    columnHelper.accessor('username', { header: vi.admin.users.columnUsername }),
    columnHelper.accessor('fullName', { header: vi.admin.users.columnFullName }),
    columnHelper.accessor('email', { header: vi.admin.users.columnEmail, cell: (c) => c.getValue() ?? '—' }),
    columnHelper.accessor('status', { header: vi.admin.users.columnStatus, cell: (c) => <UserStatusBadge status={c.getValue()} /> }),
    columnHelper.accessor('roles', {
      header: vi.admin.users.columnRoles,
      cell: (c) => (c.getValue()?.length ? c.getValue()!.map((r) => r.name).join(', ') : vi.admin.users.noRoles),
    }),
    columnHelper.accessor('createdAt', { header: vi.admin.users.columnCreatedAt, cell: (c) => formatDateTime(c.getValue()) }),
    columnHelper.display({
      id: 'actions',
      header: vi.admin.users.columnActions,
      cell: (c) => {
        const user = c.row.original;
        const isSelf = user.id === currentUserId;
        const isAdmin = user.roles?.some((r) => r.code === 'ADMIN') ?? false;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(user)}>{vi.admin.users.actionEdit}</DropdownMenuItem>
              {!isSelf && <DropdownMenuItem onSelect={() => onAssignRoles(user)}>{vi.admin.users.actionAssignRoles}</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => onResetPassword(user)}>{vi.admin.users.actionResetPassword}</DropdownMenuItem>
              {user.status === 'LOCKED' ? (
                <DropdownMenuItem onSelect={() => onUnlock(user)}>{vi.admin.users.actionUnlock}</DropdownMenuItem>
              ) : (
                !isSelf && (
                  <DropdownMenuItem variant="destructive" onSelect={() => onLock(user)}>
                    {vi.admin.users.actionLock}
                  </DropdownMenuItem>
                )
              )}
              {!isSelf && !isAdmin && (
                <DropdownMenuItem variant="destructive" onSelect={() => onDelete(user)}>
                  {vi.admin.users.actionDelete}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ];

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() });

  if (items.length === 0) {
    return <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">{vi.admin.users.emptyList}</p>;
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
