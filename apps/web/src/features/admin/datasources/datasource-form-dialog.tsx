import { useEffect, useState } from 'react';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AdminDatasource } from '@shared/index';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { vi } from '@/i18n/vi';
import {
  createAdminDatasource,
  fetchDatasourceEnvRefs,
  syncAfterDatasourceMutation,
  updateAdminDatasource,
} from './datasources-admin-api';
import { datasourceFormSchema, EMPTY_DATASOURCE_FORM_VALUES, type DatasourceFormValues } from './datasource-form-schema';
import { entryToFormValues, formValuesToEntryPayload } from './datasource-entry-converters';
import { DatasourceIdentityFields } from './datasource-identity-fields';
import { DatasourceTransportFields } from './datasource-transport-fields';
import { DatasourceInputFieldsEditor } from './datasource-input-fields-editor';
import { DatasourceOutputFieldsEditor } from './datasource-output-fields-editor';
import { mapDatasourceValidationErrors } from './map-datasource-validation-errors';

interface DatasourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `undefined`/`null` = create; a row = edit (code read-only). */
  entry?: AdminDatasource | null;
  /** For the create dialog's "copy from" select. */
  existingDatasources: AdminDatasource[];
}

/** Create/edit dialog (phase-03 Architecture, updated by the visual
 * input/output field builder follow-up) — structured fields throughout,
 * incl. a row-based visual builder for `input`/`output`
 * (`datasource-input-fields-editor.tsx`/`datasource-output-fields-editor.tsx`).
 * Server remains the single source of truth for structural/cross-field
 * correctness; the client only checks non-empty required text + valid
 * identifiers for field `name`s (`datasource-form-schema.ts`). */
export function DatasourceFormDialog({ open, onOpenChange, entry, existingDatasources }: DatasourceFormDialogProps) {
  const isEdit = !!entry;
  const queryClient = useQueryClient();
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [inputBlockErrors, setInputBlockErrors] = useState<string[]>([]);
  const [outputBlockErrors, setOutputBlockErrors] = useState<string[]>([]);
  const t = vi.admin.datasources;

  const envRefsQuery = useQuery({ queryKey: ['admin-datasources', 'env-refs'], queryFn: fetchDatasourceEnvRefs, enabled: open });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DatasourceFormValues>({ resolver: zodResolver(datasourceFormSchema), defaultValues: EMPTY_DATASOURCE_FORM_VALUES });

  useEffect(() => {
    if (!open) return;
    setFormErrors([]);
    setInputBlockErrors([]);
    setOutputBlockErrors([]);
    reset(entry ? entryToFormValues(entry) : EMPTY_DATASOURCE_FORM_VALUES);
  }, [open, entry, reset]);

  const onCopyFrom = (sourceCode: string) => {
    const source = existingDatasources.find((d) => d.code === sourceCode);
    if (!source) return;
    reset({ ...entryToFormValues(source), code: '' });
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormErrors([]);
    setInputBlockErrors([]);
    setOutputBlockErrors([]);
    try {
      const payload = formValuesToEntryPayload(values, entry ?? undefined);
      if (isEdit && entry) {
        await updateAdminDatasource(entry.code, payload);
        toast.success(t.updateSuccess);
      } else {
        await createAdminDatasource(payload);
        toast.success(t.createSuccess);
      }
      await syncAfterDatasourceMutation(queryClient);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DATASOURCE_CODE_TAKEN') {
        setError('code', { type: 'server', message: t.codeTaken });
        return;
      }
      if (error instanceof ApiError && error.details?.length) {
        const mapped = mapDatasourceValidationErrors(error.details);
        for (const { field, message } of mapped.fieldErrors) setError(field as Path<DatasourceFormValues>, { type: 'server', message });
        if (mapped.inputErrors.length) setInputBlockErrors(mapped.inputErrors);
        if (mapped.outputErrors.length) setOutputBlockErrors(mapped.outputErrors);
        if (mapped.formErrors.length) setFormErrors(mapped.formErrors);
        return;
      }
      toast.error(error instanceof ApiError ? error.message : vi.adminCommon.genericError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] w-[96vw] max-w-[96vw] flex-col overflow-y-auto sm:max-w-[1600px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? t.editTitle : t.createTitle}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-6" onSubmit={onSubmit} noValidate>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <DatasourceIdentityFields
                register={register}
                watch={watch}
                setValue={setValue}
                errors={errors}
                isEdit={isEdit}
                existingDatasources={existingDatasources}
                onCopyFrom={onCopyFrom}
              />

              <DatasourceTransportFields
                register={register}
                watch={watch}
                setValue={setValue}
                control={control}
                errors={errors}
                envRefs={envRefsQuery.data}
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="maxResults">{t.fieldMaxResults}</Label>
                  <Input id="maxResults" type="number" min={1} aria-invalid={!!errors.pageSize} {...register('maxResults')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pageSize">{t.fieldPageSize}</Label>
                  <Input id="pageSize" type="number" min={1} aria-invalid={!!errors.pageSize} {...register('pageSize')} />
                </div>
              </div>
              {errors.pageSize && <p className="text-destructive text-sm">{errors.pageSize.message}</p>}
            </div>

            <div className="flex flex-col gap-4">
              <DatasourceInputFieldsEditor control={control} register={register} watch={watch} setValue={setValue} errors={errors} />
              {inputBlockErrors.length > 0 && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
                  {inputBlockErrors.map((message, i) => (
                    <p key={i}>{message}</p>
                  ))}
                </div>
              )}

              <DatasourceOutputFieldsEditor control={control} register={register} watch={watch} setValue={setValue} errors={errors} />
              {outputBlockErrors.length > 0 && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
                  {outputBlockErrors.map((message, i) => (
                    <p key={i}>{message}</p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {formErrors.length > 0 && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">{t.formLevelErrorsTitle}</p>
              <ul className="list-disc pl-5">
                {formErrors.map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              {vi.common.cancel}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (isEdit ? vi.adminCommon.saving : vi.adminCommon.creating) : vi.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
