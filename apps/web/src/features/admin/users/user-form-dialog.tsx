import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AdminUser } from '@shared/index';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ApiError } from '@/lib/api-client';
import { vi } from '@/i18n/vi';
import { fetchRoles } from '../roles/roles-api';
import { createUser, updateUser } from './users-api';
import { userFormSchema, type UserFormValues } from './user-form-schema';

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null`/absent = create mode. */
  user?: AdminUser | null;
  /** Fired after a successful create with the one-time temp password
   * (phase-08 Requirements: reset/create shows it once, copy-to-clipboard). */
  onCreated?: (tempPassword: string, username: string) => void;
}

const EMPTY_VALUES: UserFormValues = { username: '', fullName: '', email: '', roleIds: [] };

/** Create/edit dialog for `UsersPage` (S5). Username is immutable once
 * created (phase-08 step 5) — the field is disabled, never sent, in edit mode. */
export function UserFormDialog({ open, onOpenChange, user, onCreated }: UserFormDialogProps) {
  const isEdit = !!user;
  const queryClient = useQueryClient();
  const rolesQuery = useQuery({ queryKey: ['admin-roles'], queryFn: fetchRoles, enabled: open && !isEdit });

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({ resolver: zodResolver(userFormSchema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (!open) return;
    reset(
      user
        ? { username: user.username, fullName: user.fullName, email: user.email ?? '', roleIds: [] }
        : EMPTY_VALUES,
    );
  }, [open, user, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit && user) {
        await updateUser(user.id, { fullName: values.fullName, email: values.email || undefined });
        toast.success(vi.admin.users.updateSuccess);
      } else {
        const result = await createUser({
          username: values.username,
          fullName: values.fullName,
          email: values.email || undefined,
          roleIds: values.roleIds,
        });
        toast.success(vi.admin.users.createSuccess);
        onCreated?.(result.tempPassword, result.user.username);
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'USERNAME_TAKEN') {
        setError('username', { type: 'server', message: vi.admin.users.usernameTaken });
        return;
      }
      toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? vi.admin.users.editTitle : vi.admin.users.createTitle}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">{vi.admin.users.fieldUsername}</Label>
            <Input id="username" disabled={isEdit} aria-invalid={!!errors.username} {...register('username')} />
            {isEdit ? (
              <p className="text-muted-foreground text-xs">{vi.admin.users.fieldUsernameHint}</p>
            ) : (
              errors.username && <p className="text-destructive text-sm">{errors.username.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName">{vi.admin.users.fieldFullName}</Label>
            <Input id="fullName" aria-invalid={!!errors.fullName} {...register('fullName')} />
            {errors.fullName && <p className="text-destructive text-sm">{errors.fullName.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{vi.admin.users.fieldEmail}</Label>
            <Input id="email" type="email" aria-invalid={!!errors.email} {...register('email')} />
            {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
          </div>
          {!isEdit && (
            <div className="flex flex-col gap-1.5">
              <Label>{vi.admin.users.fieldRoles}</Label>
              <Controller
                control={control}
                name="roleIds"
                render={({ field }) => (
                  <div className="flex flex-col gap-1.5">
                    {(rolesQuery.data ?? []).map((role) => (
                      <label key={role.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={field.value.includes(role.id)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked === true ? [...field.value, role.id] : field.value.filter((id) => id !== role.id),
                            )
                          }
                        />
                        {role.name}
                      </label>
                    ))}
                  </div>
                )}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              {vi.common.cancel}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (isEdit ? vi.adminCommon.saving : vi.adminCommon.creating) : vi.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
