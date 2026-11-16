import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import type { AdminDictionary } from '@shared/index';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { vi } from '@/i18n/vi';
import { PairRowsEditor } from '@/features/admin/datasources/datasource-pair-rows-editor';
import { makeEmptyFieldOptionRow } from '@/features/admin/datasources/datasource-field-row-types';
import {
  deleteAdminDictionary,
  saveAdminDictionary,
  syncAfterDictionaryMutation,
  useAdminDictionaries,
} from './dictionaries-api';

const NAME_RE = /^[A-Z][A-Z0-9_]*$/;
type Item = { value: string; label: string };

/** `/quan-tri/danh-muc` — master/detail editor for the named key -> label lists in config.json. */
export function DictionariesAdminPage() {
  const t = vi.admin.dictionaries;
  const queryClient = useQueryClient();
  const query = useAdminDictionaries();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Item[]>([]);
  const [newName, setNewName] = useState('');
  const [newNameError, setNewNameError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const current: AdminDictionary | undefined = query.data?.find((d) => d.name === selected);
  // Re-seed the editor when another dictionary is picked or the saved copy changes, never mid-typing.
  useEffect(() => {
    setDraft(current ? current.items.map((i) => ({ ...i })) : []);
  }, [current?.name, JSON.stringify(current?.items)]);

  const onError = (error: unknown) => toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError);

  const saveMutation = useMutation({
    mutationFn: ({ name, items }: { name: string; items: Item[] }) => saveAdminDictionary(name, items),
    onSuccess: async (saved) => {
      toast.success(t.saveSuccess);
      await syncAfterDictionaryMutation(queryClient);
      setSelected(saved.name);
    },
    onError,
  });
  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteAdminDictionary(name),
    onSuccess: async () => {
      toast.success(t.deleteSuccess);
      setSelected(null);
      setConfirmDelete(false);
      await syncAfterDictionaryMutation(queryClient);
    },
    onError: (error) => {
      setConfirmDelete(false);
      onError(error);
    },
  });

  const addDictionary = () => {
    const name = newName.trim();
    if (!NAME_RE.test(name)) return setNewNameError(t.newNameInvalid);
    if (query.data?.some((d) => d.name === name)) return setNewNameError(t.newNameTaken);
    // Created empty in memory; it is written on the first "Lưu" (an empty dictionary is valid but pointless).
    setNewNameError(null);
    setNewName('');
    setSelected(name);
    setDraft([makeEmptyFieldOptionRow()]);
  };

  const duplicate = new Set(draft.map((i) => i.value).filter((v, idx, all) => v && all.indexOf(v) !== idx));
  const canSave = !!selected && draft.length > 0 && draft.every((i) => i.value.trim() && i.label.trim()) && duplicate.size === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="text-muted-foreground text-sm">{t.intro}</p>
      </div>

      {query.isLoading && <Skeleton className="h-40 w-full" />}
      {query.isError && (
        <p role="alert" className="text-destructive text-sm">
          {query.error instanceof ApiError ? query.error.message : vi.adminCommon.genericError}
        </p>
      )}

      {query.data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {query.data.length === 0 && <p className="text-muted-foreground text-sm">{t.empty}</p>}
              {query.data.map((d) => (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => setSelected(d.name)}
                  className={cn('hover:bg-muted flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm', selected === d.name && 'bg-muted font-medium')}
                >
                  <span className="font-mono">{d.name}</span>
                  <span className="text-muted-foreground text-xs">{t.itemCount(d.items.length)}</span>
                </button>
              ))}
              <div className="mt-2 flex flex-col gap-1.5 border-t pt-3">
                <div className="flex gap-2">
                  <Input value={newName} placeholder={t.newNamePlaceholder} onChange={(e) => setNewName(e.target.value.toUpperCase())} />
                  <Button type="button" size="icon-sm" onClick={addDictionary} aria-label={t.createButton}>
                    <Plus />
                  </Button>
                </div>
                {newNameError && <p className="text-destructive text-xs">{newNameError}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-base">{selected ?? t.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!selected && <p className="text-muted-foreground text-sm">{t.selectHint}</p>}
              {selected && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium">{t.itemsTitle}</span>
                    <PairRowsEditor
                      rows={draft}
                      onRowsChange={setDraft}
                      firstField="value"
                      secondField="label"
                      firstPlaceholder={t.keyPlaceholder}
                      secondPlaceholder={t.labelPlaceholder}
                      addButtonLabel={t.addItemButton}
                      makeEmptyRow={makeEmptyFieldOptionRow}
                    />
                    {duplicate.size > 0 && <p className="text-destructive text-xs">{t.duplicateKey}: {Array.from(duplicate).join(', ')}</p>}
                  </div>
                  <div className="text-sm">
                    <span className="text-xs font-medium">{t.usedByTitle}: </span>
                    {current && current.usedBy.length > 0
                      ? current.usedBy.map((u) => `${u.datasource}.${u.field} (${u.kind === 'input' ? t.inputKind : t.outputKind})`).join(', ')
                      : t.notUsed}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate({ name: selected, items: draft.map((i) => ({ value: i.value.trim(), label: i.label.trim() })) })}>
                      {t.saveButton}
                    </Button>
                    {current && (
                      <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)}>
                        <Trash2 data-icon="inline-start" />
                        {t.deleteButton}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t.deleteConfirmTitle}
        description={selected ? t.deleteConfirmBody(selected) : ''}
        destructive
        isPending={deleteMutation.isPending}
        onConfirm={() => selected && deleteMutation.mutate(selected)}
      />
    </div>
  );
}
