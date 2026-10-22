import { QueryClient } from '@tanstack/react-query';

/**
 * A lookup (`POST /query/:code`) is an explicit, audited user action — it
 * must never silently re-fire on window refocus (see phase-06 step 8). It is
 * modeled as a mutation (Phase 07), not a query, for that reason. Plain GET
 * data (datasource list, history, admin lists) uses these query defaults.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
