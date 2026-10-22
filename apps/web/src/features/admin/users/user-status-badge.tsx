import type { UserStatusValue } from '@shared/index';
import { Badge } from '@/components/ui/badge';
import { vi } from '@/i18n/vi';

const STATUS_VARIANT: Record<UserStatusValue, 'default' | 'destructive' | 'secondary'> = {
  ACTIVE: 'default',
  LOCKED: 'destructive',
  DISABLED: 'secondary',
};

const STATUS_LABEL: Record<UserStatusValue, string> = {
  ACTIVE: vi.admin.users.statusActive,
  LOCKED: vi.admin.users.statusLocked,
  DISABLED: vi.admin.users.statusDisabled,
};

export function UserStatusBadge({ status }: { status: UserStatusValue }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
