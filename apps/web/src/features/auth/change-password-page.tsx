import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/lib/auth-store';
import { ApiError } from '@/lib/api-client';
import { vi } from '@/i18n/vi';
import * as authApi from './auth-api';
import { changePasswordFormSchema, type ChangePasswordFormValues } from './change-password-schema';

/** Forced first-login / post-admin-reset password change (S1 continuation).
 * Backend skips the current-password check when `mustChangePassword` is set
 * (auth.service.ts), so that field is only shown for a voluntary change. */
export function ChangePasswordPage() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const setSession = useAuthStore((state) => state.setSession);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({ resolver: zodResolver(changePasswordFormSchema) });

  if (status !== 'authenticated' || !user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to="/" replace />;

  const onSubmit = async (values: ChangePasswordFormValues) => {
    setFormError(null);
    try {
      await authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // Session (access token + refresh cookie) stays valid after a forced
      // change — re-hydrate from `/auth/me` to clear `mustChangePassword`.
      const me = await authApi.fetchMe();
      if (accessToken) setSession(accessToken, me);
      toast.success(vi.auth.changePasswordSuccess);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : vi.errors.unexpectedError);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{vi.auth.changePasswordTitle}</CardTitle>
          <CardDescription>{vi.auth.changePasswordSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newPassword">{vi.auth.newPassword}</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.newPassword}
                {...register('newPassword')}
              />
              {errors.newPassword && <p className="text-destructive text-sm">{errors.newPassword.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">{vi.auth.confirmPassword}</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-destructive text-sm">{errors.confirmPassword.message}</p>
              )}
            </div>
            {formError && (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
              {vi.auth.changePasswordSubmit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
