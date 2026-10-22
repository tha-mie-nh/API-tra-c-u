import type { AuditLogsListResponse } from '@shared/index';
import { apiFetch } from '@/lib/api-client';

export interface AuditLogsListParams {
  page?: number;
  pageSize?: number;
  actorUserId?: string;
  targetType?: string;
}

function buildQueryString(params: AuditLogsListParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** `GET /admin/audit-logs` (reference-api-specification.md "Admin", spec g). */
export function fetchAuditLogs(params: AuditLogsListParams): Promise<AuditLogsListResponse> {
  return apiFetch<AuditLogsListResponse>(`/admin/audit-logs${buildQueryString(params)}`);
}
