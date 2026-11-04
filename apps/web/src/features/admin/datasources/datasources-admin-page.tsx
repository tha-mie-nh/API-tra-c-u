import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import type { AdminDatasource } from '@shared/index';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ApiError } from '@/lib/api-client';
import { vi } from '@/i18n/vi';
import {
  deleteAdminDatasource,
  fetchAdminDatasources,
  setAdminDatasourceEnabled,
  syncAfterDatasourceMutation,
} from './datasources-admin-api';
import { DatasourcesAdminTable } from './datasources-admin-table';
import { DatasourceFormDialog } from './datasource-form-dialog';

/** `/quan-tri/nguon-du-lieu` (phase-03) — list + toggle + delete +
 * create/edit dialog for `config.json` datasource entries. */
export function DatasourcesAdminPage() {
  const queryClient = useQueryClient();
  const t = vi.admin.datasources;
  const [formEntry, setFormEntry] = useState<AdminDatasource | null | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminDatasource | null>(null);

  const query = useQuery({ queryKey: ['admin-datasources'], queryFn: fetchAdminDatasources });

  const toggleMutation = useMutation({
    mutationFn: ({ entry, enabled }: { entry: AdminDatasource; enabled: boolean }) => setAdminDatasourceEnabled(entry.code, enabled),
    onSuccess: async () => {
      toast.success(t.toggleSuccess);
      await syncAfterDatasourceMutation(queryClient);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError),
  });

  const deleteMutation = useMutation({
    mutationFn: (entry: AdminDatasource) => deleteAdminDatasource(entry.code),
    onSuccess: async () => {
      toast.success(t.deleteSuccess);
      await syncAfterDatasourceMutation(queryClient);
      setDeleteTarget(null);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <Button
          onClick={() => {
            setFormEntry(null);
            setFormOpen(true);
          }}
        >
          <Plus data-icon="inline-start" />
          {t.createButton}
        </Button>
      </div>

      {query.isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {query.isError && (
        <p role="alert" className="text-destructive text-sm">
          {query.error instanceof ApiError ? query.error.message : vi.adminCommon.genericError}
        </p>
      )}
      {query.data && (
        <DatasourcesAdminTable
          items={query.data}
          onToggle={(entry, enabled) => toggleMutation.mutate({ entry, enabled })}
          onEdit={(entry) => {
            setFormEntry(entry);
            setFormOpen(true);
          }}
          onDelete={setDeleteTarget}
        />
      )}

      <DatasourceFormDialog open={formOpen} onOpenChange={setFormOpen} entry={formEntry} existingDatasources={query.data ?? []} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t.deleteConfirmTitle}
        description={deleteTarget ? t.deleteConfirmBody(deleteTarget.name) : ''}
        destructive
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
      />
    </div>
  );
}
