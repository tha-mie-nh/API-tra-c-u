import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { vi } from '@/i18n/vi';
import * as authApi from './auth-api';

const forgotPasswordFormSchema = z.object({
  username: z.string().min(1, vi.auth.usernameRequired),
});
type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;

/**
 * Self-service "forgot password" (no email — see login page comment): the
 * user submits a username, an admin approves/rejects from the Users page.
 * Always shows the same success message regardless of whether the account
 * exists, mirroring the backend's anti-enumeration behavior.
 */
export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordFormSchema) });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    await authApi.requestPasswordReset(values.username).catch(() => undefined);
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{vi.auth.forgotPasswordTitle}</CardTitle>
          <CardDescription>{vi.auth.forgotPasswordSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm">{vi.auth.forgotPasswordSuccess}</p>
              <Link to="/login" className="text-primary text-sm underline">
                {vi.auth.backToLogin}
              </Link>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="username">{vi.auth.username}</Label>
                <Input id="username" autoComplete="username" autoFocus aria-invalid={!!errors.username} {...register('username')} />
                {errors.username && <p className="text-destructive text-sm">{errors.username.message}</p>}
              </div>
              <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
                {isSubmitting ? vi.auth.forgotPasswordSubmitting : vi.auth.forgotPasswordSubmit}
              </Button>
              <Link to="/login" className="text-muted-foreground text-center text-sm underline">
                {vi.auth.backToLogin}
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
