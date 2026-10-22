import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PasswordResetRequestItem } from '@shared/index';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { approvePasswordResetRequest, fetchPasswordResetRequests, rejectPasswordResetRequest } from './users-api';
import { ResetPasswordResultDialog } from './reset-password-result-dialog';

/**
 * Self-service "forgot password" queue (no email flow — see login page
 * comment): every request a user submitted from `/quen-mat-khau`, with
 * approve/reject actions. Approve re-uses the same one-time temp-password
 * dialog as the per-user "Đặt lại mật khẩu" action (Phase 08 pattern).
 */
export function PasswordResetRequestsPanel() {
  const queryClient = useQueryClient();
  const [approveTarget, setApproveTarget] = useState<PasswordResetRequestItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PasswordResetRequestItem | null>(null);
  const [tempPasswordResult, setTempPasswordResult] = useState<{ username: string; tempPassword: string } | null>(null);

  const query = useQuery<PasswordResetRequestItem[]>({
    queryKey: ['password-reset-requests'],
    queryFn: fetchPasswordResetRequests,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['password-reset-requests'] });

  const approveMutation = useMutation({
    mutationFn: (item: PasswordResetRequestItem) => approvePasswordResetRequest(item.id),
    onSuccess: async (result) => {
      toast.success(vi.admin.users.resetRequestsApproveSuccess);
      setTempPasswordResult({ username: result.username, tempPassword: result.tempPassword });
      setApproveTarget(null);
      await invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError),
  });

  const rejectMutation = useMutation({
    mutationFn: (item: PasswordResetRequestItem) => rejectPasswordResetRequest(item.id),
    onSuccess: async () => {
      toast.success(vi.admin.users.resetRequestsRejectSuccess);
      setRejectTarget(null);
      await invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError),
  });

  const pending = query.data?.filter((item) => item.status === 'PENDING') ?? [];

  const statusLabel = (status: PasswordResetRequestItem['status']) =>
    status === 'PENDING'
      ? vi.admin.users.resetRequestsStatusPending
      : status === 'APPROVED'
        ? vi.admin.users.resetRequestsStatusApproved
        : vi.admin.users.resetRequestsStatusRejected;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{vi.admin.users.resetRequestsTitle}</CardTitle>
        {pending.length > 0 && <Badge variant="destructive">{pending.length}</Badge>}
      </CardHeader>
      <CardContent>
        {query.isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
        {query.isError && (
          <p role="alert" className="text-destructive text-sm">
            {query.error instanceof ApiError ? query.error.message : vi.adminCommon.genericError}
          </p>
        )}
        {query.data && pending.length === 0 && (
          <p className="text-muted-foreground text-sm">{vi.admin.users.resetRequestsEmpty}</p>
        )}
        {pending.length > 0 && (
          <div className="flex flex-col gap-3">
            {pending.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{item.username}</span>
                  <span className="text-muted-foreground text-xs">{formatDateTime(item.requestedAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{statusLabel(item.status)}</Badge>
                  <Button size="sm" onClick={() => setApproveTarget(item)}>
                    {vi.admin.users.resetRequestsApprove}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejectTarget(item)}>
                    {vi.admin.users.resetRequestsReject}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={(open) => !open && setApproveTarget(null)}
        title={vi.admin.users.resetRequestsApproveConfirmTitle}
        description={approveTarget ? vi.admin.users.resetRequestsApproveConfirmBody(approveTarget.username) : ''}
        isPending={approveMutation.isPending}
        onConfirm={() => approveTarget && approveMutation.mutate(approveTarget)}
      />
      <ConfirmDialog
        open={!!rejectTarget}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        title={vi.admin.users.resetRequestsRejectConfirmTitle}
        description={rejectTarget ? vi.admin.users.resetRequestsRejectConfirmBody(rejectTarget.username) : ''}
        destructive
        isPending={rejectMutation.isPending}
        onConfirm={() => rejectTarget && rejectMutation.mutate(rejectTarget)}
      />
      <ResetPasswordResultDialog result={tempPasswordResult} onOpenChange={(open) => !open && setTempPasswordResult(null)} />
    </Card>
  );
}
