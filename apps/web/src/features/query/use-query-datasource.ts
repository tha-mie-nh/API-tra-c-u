import { useMutation } from '@tanstack/react-query';
import type { QueryEnvelope, QueryRequestBody } from '@shared/index';
import { apiFetch } from '@/lib/api-client';

/**
 * `POST /query/:code` as a TanStack **mutation**, not a query — a lookup is
 * an explicit, audited user action and must never silently refetch on
 * window refocus/remount (phase-07 Implementation Step 5, lib/query-client.ts).
 */
export function useQueryDatasource(code: string) {
  return useMutation({
    mutationFn: (body: QueryRequestBody) => apiFetch<QueryEnvelope>(`/query/${code}`, { method: 'POST', body }),
  });
}
