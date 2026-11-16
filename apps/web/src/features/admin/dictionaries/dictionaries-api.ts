import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { AdminDictionary } from '@shared/index';
import { apiFetch } from '@/lib/api-client';

export const DICTIONARIES_QUERY_KEY = ['admin-dictionaries'];

export function fetchAdminDictionaries(): Promise<AdminDictionary[]> {
  return apiFetch<AdminDictionary[]>('/admin/dictionaries');
}

export function saveAdminDictionary(name: string, items: { value: string; label: string }[]): Promise<AdminDictionary> {
  return apiFetch<AdminDictionary>(`/admin/dictionaries/${name}`, { method: 'PUT', body: { items } });
}

export function deleteAdminDictionary(name: string): Promise<{ name: string }> {
  return apiFetch<{ name: string }>(`/admin/dictionaries/${name}`, { method: 'DELETE' });
}

/** Dictionary list for pickers (datasource form) and the dictionaries page. */
export function useAdminDictionaries(enabled = true) {
  return useQuery({ queryKey: DICTIONARIES_QUERY_KEY, queryFn: fetchAdminDictionaries, enabled });
}

/** A dictionary write changes what datasources resolve to, so refresh both lists. */
export async function syncAfterDictionaryMutation(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: DICTIONARIES_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ['admin-datasources'] }),
    queryClient.invalidateQueries({ queryKey: ['datasources'] }),
    queryClient.invalidateQueries({ queryKey: ['datasource'] }),
  ]);
}
