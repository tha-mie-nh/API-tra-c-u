import { ShieldAlert } from 'lucide-react';
import { StatusPage } from '@/components/layout/status-page';
import { vi } from '@/i18n/vi';

/** Rendered when `RequirePermission` denies FE navigation. The backend also
 * 403s the same action independently (phase-06 Risk Assessment: "FE hiding
 * is UX only"). */
export function ForbiddenPage() {
  return (
    <StatusPage
      icon={<ShieldAlert className="text-destructive size-10" />}
      title={vi.errors.forbiddenTitle}
      body={vi.errors.forbiddenBody}
      actionLabel={vi.common.goHome}
      actionTo="/"
    />
  );
}
