import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import type { AdminRole } from '@shared/index';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ApiError } from '@/lib/api-client';
import { vi } from '@/i18n/vi';
import { deleteRole, fetchRoles } from './roles-api';
import { RolesTable } from './roles-table';
import { RoleFormDialog } from './role-form-dialog';
import { PermissionMatrixDialog } from './permission-matrix-dialog';

/** `/quan-tri/vai-tro` (S6) — role CRUD + permission matrix. */
export function RolesPage() {
  const queryClient = useQueryClient();
  const [formRole, setFormRole] = useState<AdminRole | null | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [permissionsRole, setPermissionsRole] = useState<AdminRole | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRole | null>(null);

  const query = useQuery({ queryKey: ['admin-roles'], queryFn: fetchRoles });

  const deleteMutation = useMutation({
    mutationFn: (role: AdminRole) => deleteRole(role.id),
    onSuccess: async () => {
      toast.success(vi.admin.roles.deleteSuccess);
      await queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      setDeleteTarget(null);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{vi.admin.roles.title}</h1>
        <Button
          onClick={() => {
            setFormRole(null);
            setFormOpen(true);
          }}
        >
          <Plus data-icon="inline-start" />
          {vi.admin.roles.createButton}
        </Button>
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
        <RolesTable
          items={query.data}
          onEdit={(role) => {
            setFormRole(role);
            setFormOpen(true);
          }}
          onPermissions={setPermissionsRole}
          onDelete={setDeleteTarget}
        />
      )}

      <RoleFormDialog open={formOpen} onOpenChange={setFormOpen} role={formRole} />
      <PermissionMatrixDialog role={permissionsRole} onOpenChange={(open) => !open && setPermissionsRole(null)} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={vi.admin.roles.deleteConfirmTitle}
        description={deleteTarget ? vi.admin.roles.deleteConfirmBody(deleteTarget.name) : ''}
        destructive
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
      />
    </div>
  );
}
