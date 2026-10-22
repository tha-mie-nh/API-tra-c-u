import { useQuery } from '@tanstack/react-query';
import type { ClientDatasource } from '@shared/index';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

/**
 * `GET /datasources` — already filtered server-side to the caller's
 * permitted datasources (reference-api-specification.md). This is the sole
 * source of truth for the "Tra cứu" sidebar section; Phase 07 reuses this
 * same hook for the query-form pages.
 */
export function useDatasources() {
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery<ClientDatasource[]>({
    queryKey: ['datasources'],
    queryFn: () => apiFetch<ClientDatasource[]>('/datasources'),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}
