import { FEATURE_PERMISSION_CODES } from '@shared/index';
import { useAuthStore } from '@/lib/auth-store';

/** Drill-down links only match the stats when History is not scoped to the user's own rows. */
export function useCanDrillDown(): boolean {
  return useAuthStore((s) => s.hasPermission(FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL));
}
