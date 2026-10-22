import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ClientDatasource, QueryEnvelope } from '@shared/index';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { vi } from '@/i18n/vi';
import { DynamicSearchForm } from './dynamic-form/dynamic-search-form';
import { InfoTimeline } from './results/info-timeline';
import { PhotoTimeline } from './results/photo-timeline';
import { TruncationNotice } from './results/truncation-notice';
import { QueryPagination } from './results/query-pagination';
import { EmptyState, ErrorState, LoadingSkeleton } from './results/result-states';
import { useQueryDatasource } from './use-query-datasource';
import { queryErrorMessage } from './query-error-message';
import { useQueryResultStore } from './query-result-store';

/**
 * ONE page for every datasource (phase-07 Architecture) — reached via
 * `/tra-cuu/:code` (route guard + permission check already applied by
 * `AppRoutes`/`RequirePermission`, phase 06). `datasource.type` is the ONLY
 * type-based branch in the whole feature (form + table/photo grid + errors
 * are otherwise fully config-driven).
 */
export function QueryPage() {
  const { code = '' } = useParams<{ code: string }>();
  const cachedResult = useQueryResultStore((state) => state.resultsByCode[code]);
  const setCachedResult = useQueryResultStore((state) => state.setResult);
  const [page, setPage] = useState(() => cachedResult?.page ?? 1);
  const [lastParams, setLastParams] = useState<Record<string, unknown> | null>(() => cachedResult?.params ?? null);

  const datasourceQuery = useQuery<ClientDatasource>({
    queryKey: ['datasource', code],
    queryFn: () => apiFetch<ClientDatasource>(`/datasources/${code}`),
    enabled: !!code,
  });

  const mutation = useQueryDatasource(code);

  // Navigating between two DIFFERENT `/tra-cuu/:code` pages must drop the
  // previous datasource's in-flight/pending state and seed from whatever
  // result is cached for the new `code` (review feedback: revisiting the
  // SAME datasource after navigating away must still show the result just
  // looked up — `useQueryResultStore` survives this component's unmount).
  useEffect(() => {
    const cached = useQueryResultStore.getState().resultsByCode[code];
    setPage(cached?.page ?? 1);
    setLastParams(cached?.params ?? null);
    mutation.reset();
    // Intentionally re-runs only on `code` change — `mutation` is a stable
    // TanStack Query object, including it would not change this effect's behavior.
  }, [code]);

  const handleSearch = (params: Record<string, unknown>) => {
    setPage(1);
    setLastParams(params);
    mutation.mutate(
      { params, page: 1 },
      { onSuccess: (envelope) => setCachedResult(code, { params, page: 1, envelope }) },
    );
  };

  const handlePageChange = (nextPage: number) => {
    if (!lastParams) return;
    setPage(nextPage);
    mutation.mutate(
      { params: lastParams, page: nextPage },
      { onSuccess: (envelope) => setCachedResult(code, { params: lastParams, page: nextPage, envelope }) },
    );
  };

  if (datasourceQuery.isLoading) return <LoadingSkeleton />;
  if (datasourceQuery.isError) return <ErrorState message={queryErrorMessage(datasourceQuery.error)} />;

  const datasource = datasourceQuery.data;
  if (!datasource) return null;

  const envelope = (mutation.data as QueryEnvelope | undefined) ?? cachedResult?.envelope;
  const isValidationError = mutation.error instanceof ApiError && mutation.error.code === 'VALIDATION_ERROR';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{datasource.name}</h1>
        {datasource.description && <p className="text-muted-foreground text-sm">{datasource.description}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{vi.query.searchFormTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <DynamicSearchForm
            datasource={datasource}
            onSearch={handleSearch}
            isSubmitting={mutation.isPending}
            serverError={mutation.error}
            initialValues={lastParams ?? undefined}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {mutation.isPending && <LoadingSkeleton />}
        {mutation.isError && !isValidationError && <ErrorState message={queryErrorMessage(mutation.error)} />}
        {envelope && envelope.groups.length === 0 && <EmptyState />}
        {envelope && envelope.groups.length > 0 && (
          <>
            <TruncationNotice page={envelope.page} />
            {datasource.type === 'image' ? (
              <PhotoTimeline envelope={envelope} code={code} />
            ) : (
              <InfoTimeline envelope={envelope} />
            )}
            <QueryPagination page={envelope.page} currentPage={page} onPageChange={handlePageChange} />
          </>
        )}
      </div>
    </div>
  );
}
