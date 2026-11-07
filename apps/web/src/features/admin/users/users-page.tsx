import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import type { AdminUser, AdminUsersListResponse } from '@shared/index';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ListPagination } from '@/components/common/list-pagination';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { vi } from '@/i18n/vi';
import { deleteUser, fetchUsers, lockUser, resetUserPassword, unlockUser } from './users-api';
import { UsersTable } from './users-table';
import { UserFormDialog } from './user-form-dialog';
import { AssignRolesDialog } from './assign-roles-dialog';
import { ResetPasswordResultDialog } from './reset-password-result-dialog';
import { PasswordResetRequestsPanel } from './password-reset-requests-panel';

const PAGE_SIZE = 20;

/** `/quan-tri/nguoi-dung` (S5) — list/search + create/edit/lock/unlock/
 * assign-roles/reset-password, every mutation refetches (phase-08
 * non-functional requirement: correctness over snappy optimistic updates). */
export function UsersPage() {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [formUser, setFormUser] = useState<AdminUser | null | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [rolesUser, setRolesUser] = useState<AdminUser | null>(null);
  const [lockTarget, setLockTarget] = useState<AdminUser | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<AdminUser | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [tempPasswordResult, setTempPasswordResult] = useState<{ username: string; tempPassword: string } | null>(null);

  const query = useQuery<AdminUsersListResponse>({
    queryKey: ['admin-users', { search, page }],
    queryFn: () => fetchUsers({ search: search || undefined, page, pageSize: PAGE_SIZE }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const lockMutation = useMutation({
    mutationFn: (user: AdminUser) => lockUser(user.id),
    onSuccess: async () => {
      toast.success(vi.admin.users.lockSuccess);
      await invalidate();
      setLockTarget(null);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError),
  });

  const unlockMutation = useMutation({
    mutationFn: (user: AdminUser) => unlockUser(user.id),
    onSuccess: async () => {
      toast.success(vi.admin.users.unlockSuccess);
      await invalidate();
      setUnlockTarget(null);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError),
  });

  const resetMutation = useMutation({
    mutationFn: (user: AdminUser) => resetUserPassword(user.id),
    onSuccess: (result, user) => {
      setTempPasswordResult({ username: user.username, tempPassword: result.tempPassword });
      setResetTarget(null);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError),
  });

  const deleteMutation = useMutation({
    mutationFn: (user: AdminUser) => deleteUser(user.id),
    onSuccess: async () => {
      toast.success(vi.admin.users.deleteSuccess);
      await invalidate();
      setDeleteTarget(null);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{vi.admin.users.title}</h1>
        <Button
          onClick={() => {
            setFormUser(null);
            setFormOpen(true);
          }}
        >
          <Plus data-icon="inline-start" />
          {vi.admin.users.createButton}
        </Button>
      </div>

      <PasswordResetRequestsPanel />

      <Input
        placeholder={vi.admin.users.searchPlaceholder}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-sm"
      />

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
          <UsersTable
            items={query.data.items}
            currentUserId={currentUserId}
            onEdit={(user) => {
              setFormUser(user);
              setFormOpen(true);
            }}
            onLock={setLockTarget}
            onUnlock={setUnlockTarget}
            onAssignRoles={setRolesUser}
            onResetPassword={setResetTarget}
            onDelete={setDeleteTarget}
          />
          <ListPagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPageChange={setPage} />
        </>
      )}

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        user={formUser}
        onCreated={(tempPassword, username) => setTempPasswordResult({ username, tempPassword })}
      />
      <AssignRolesDialog user={rolesUser} onOpenChange={(open) => !open && setRolesUser(null)} />
      <ResetPasswordResultDialog result={tempPasswordResult} onOpenChange={(open) => !open && setTempPasswordResult(null)} />

      <ConfirmDialog
        open={!!lockTarget}
        onOpenChange={(open) => !open && setLockTarget(null)}
        title={vi.admin.users.lockConfirmTitle}
        description={lockTarget ? vi.admin.users.lockConfirmBody(lockTarget.username) : ''}
        destructive
        isPending={lockMutation.isPending}
        onConfirm={() => lockTarget && lockMutation.mutate(lockTarget)}
      />
      <ConfirmDialog
        open={!!unlockTarget}
        onOpenChange={(open) => !open && setUnlockTarget(null)}
        title={vi.admin.users.unlockConfirmTitle}
        description={unlockTarget ? vi.admin.users.unlockConfirmBody(unlockTarget.username) : ''}
        isPending={unlockMutation.isPending}
        onConfirm={() => unlockTarget && unlockMutation.mutate(unlockTarget)}
      />
      <ConfirmDialog
        open={!!resetTarget}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title={vi.admin.users.resetPasswordConfirmTitle}
        description={resetTarget ? vi.admin.users.resetPasswordConfirmBody(resetTarget.username) : ''}
        destructive
        isPending={resetMutation.isPending}
        onConfirm={() => resetTarget && resetMutation.mutate(resetTarget)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={vi.admin.users.deleteConfirmTitle}
        description={deleteTarget ? vi.admin.users.deleteConfirmBody(deleteTarget.username) : ''}
        destructive
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
      />
    </div>
  );
}
