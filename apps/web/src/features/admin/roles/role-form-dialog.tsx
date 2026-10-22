import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AdminRole } from '@shared/index';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { vi } from '@/i18n/vi';
import { createRole, updateRole } from './roles-api';
import { roleFormSchema, type RoleFormValues } from './role-form-schema';

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: AdminRole | null;
}

const EMPTY_VALUES: RoleFormValues = { code: '', name: '', description: '' };

/** Create/edit dialog for `RolesPage` (S6) — code is immutable once created
 * (mirrors the username-immutable pattern in `UserFormDialog`). */
export function RoleFormDialog({ open, onOpenChange, role }: RoleFormDialogProps) {
  const isEdit = !!role;
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RoleFormValues>({ resolver: zodResolver(roleFormSchema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (!open) return;
    reset(role ? { code: role.code, name: role.name, description: role.description ?? '' } : EMPTY_VALUES);
  }, [open, role, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit && role) {
        await updateRole(role.id, { name: values.name, description: values.description });
        toast.success(vi.admin.roles.updateSuccess);
      } else {
        await createRole({ code: values.code, name: values.name, description: values.description });
        toast.success(vi.admin.roles.createSuccess);
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ROLE_CODE_TAKEN') {
        setError('code', { type: 'server', message: vi.admin.roles.codeTaken });
        return;
      }
      toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? vi.admin.roles.editTitle : vi.admin.roles.createTitle}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">{vi.admin.roles.fieldCode}</Label>
            <Input id="code" disabled={isEdit} aria-invalid={!!errors.code} {...register('code')} />
            {isEdit ? (
              <p className="text-muted-foreground text-xs">{vi.admin.roles.fieldCodeHint}</p>
            ) : (
              errors.code && <p className="text-destructive text-sm">{errors.code.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">{vi.admin.roles.fieldName}</Label>
            <Input id="name" aria-invalid={!!errors.name} {...register('name')} />
            {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">{vi.admin.roles.fieldDescription}</Label>
            <Textarea id="description" {...register('description')} />
          </div>
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
