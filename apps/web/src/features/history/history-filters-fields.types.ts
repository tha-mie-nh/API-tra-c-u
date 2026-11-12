import type { QueryLogFilterParams } from '@shared/index';

/** Props shared by the filter field groups (draft is applied only on "Tìm lịch sử"). */
export interface HistoryFilterFieldsProps {
  draft: QueryLogFilterParams;
  set: <K extends keyof QueryLogFilterParams>(key: K, value: QueryLogFilterParams[K] | undefined) => void;
  canViewAll: boolean;
}
