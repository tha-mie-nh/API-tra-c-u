import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AdminUser } from '@shared/index';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ApiError } from '@/lib/api-client';
import { vi } from '@/i18n/vi';
import { fetchRoles } from '../roles/roles-api';
import { setUserRoles } from './users-api';

interface AssignRolesDialogProps {
  user: AdminUser | null;
  onOpenChange: (open: boolean) => void;
}

const ADMIN_ROLE_CODE = 'ADMIN';

/**
 * `PUT /admin/users/:id/roles` is a full replace (phase-08 step 8) — pre-
 * selects the user's CURRENT roles (`user.roles`, populated by
 * `UsersService.list/findOne` eager-loading `userRoles.role`) so saving
 * never silently drops an existing grant the admin didn't intend to remove.
 */
export function AssignRolesDialog({ user, onOpenChange }: AssignRolesDialogProps) {
  const queryClient = useQueryClient();
  const rolesQuery = useQuery({ queryKey: ['admin-roles'], queryFn: fetchRoles, enabled: !!user });
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected(user?.roles?.map((r) => r.id) ?? []);
  }, [user]);

  const mutation = useMutation({
    mutationFn: () => setUserRoles(user!.id, selected),
    onSuccess: async () => {
      toast.success(vi.admin.users.assignRolesSuccess);
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError),
  });

  if (!user) return null;

  const roles = rolesQuery.data ?? [];
  const adminRole = roles.find((r) => r.code === ADMIN_ROLE_CODE);
  const wasAdmin = user.roles?.some((r) => r.code === ADMIN_ROLE_CODE) ?? false;
  const showLastAdminWarning = !!adminRole && wasAdmin && !selected.includes(adminRole.id);

  const toggle = (roleId: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, roleId] : prev.filter((id) => id !== roleId)));
  };

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{vi.admin.users.assignRolesTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{vi.admin.users.assignRolesBody(user.username)}</p>
        <div className="flex flex-col gap-2">
          {roles.map((role) => (
            <label key={role.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={selected.includes(role.id)} onCheckedChange={(checked) => toggle(role.id, checked === true)} />
              {role.name}
            </label>
          ))}
        </div>
        {showLastAdminWarning && <p className="text-destructive text-xs">{vi.admin.users.assignRolesLastAdminWarning}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {vi.common.cancel}
          </Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? vi.adminCommon.saving : vi.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
