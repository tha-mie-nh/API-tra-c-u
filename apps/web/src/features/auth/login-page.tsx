import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/lib/auth-store';
import { vi } from '@/i18n/vi';
import { loginFormSchema, type LoginFormValues } from './login-schema';
import { useLogin, loginErrorMessage } from './use-auth';

/** S1 — Đăng nhập (reference-screens-and-ux.md). No self-register; forgot
 * password is self-service request + admin approval (no email), via
 * `/quen-mat-khau` — admin still has the final say on every password reset
 * (spec), so this screen stays otherwise minimal (YAGNI). */
export function LoginPage() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema) });

  if (status === 'booting') {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-muted-foreground text-sm">{vi.common.loading}</p>
      </div>
    );
  }

  if (status === 'authenticated' && user) {
    const redirectTo = user.mustChangePassword
      ? '/change-password'
      : ((location.state as { from?: string } | null)?.from ?? '/');
    return <Navigate to={redirectTo} replace />;
  }

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    try {
      await login(values.username, values.password);
    } catch (error) {
      setFormError(loginErrorMessage(error));
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{vi.auth.loginTitle}</CardTitle>
          <CardDescription>{vi.auth.loginSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">{vi.auth.username}</Label>
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                aria-invalid={!!errors.username}
                {...register('username')}
              />
              {errors.username && <p className="text-destructive text-sm">{errors.username.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{vi.auth.password}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
            </div>
            {formError && (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
              {isSubmitting ? vi.auth.submitting : vi.auth.submit}
            </Button>
            <Link to="/quen-mat-khau" className="text-muted-foreground text-center text-sm underline">
              {vi.auth.forgotPasswordLink}
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
