import { create } from 'zustand';
import type { QueryEnvelope } from '@shared/index';

interface CachedQueryResult {
  params: Record<string, unknown>;
  page: number;
  envelope: QueryEnvelope;
}

interface QueryResultState {
  resultsByCode: Record<string, CachedQueryResult>;
  setResult: (code: string, result: CachedQueryResult) => void;
}

/**
 * In-memory-only (no `persist`, same as `auth-store.ts`) cache of the last
 * successful lookup per datasource code — review feedback: navigating away
 * from `/tra-cuu/:code` and back must still show the result just looked up,
 * not an empty form. `QueryPage` unmounts on route change, wiping its own
 * `useState`, so this has to live outside the component. Deliberately NOT a
 * refetch-on-remount (`useQueryDatasource`'s own doc comment: a lookup is an
 * audited action and must never silently re-fire) — this only replays
 * already-fetched data client-side.
 */
export const useQueryResultStore = create<QueryResultState>((set) => ({
  resultsByCode: {},
  setResult: (code, result) =>
    set((state) => ({ resultsByCode: { ...state.resultsByCode, [code]: result } })),
}));
