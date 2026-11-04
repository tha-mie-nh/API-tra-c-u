import { useState } from 'react';
import { useFieldArray, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue, type UseFormWatch } from 'react-hook-form';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { vi } from '@/i18n/vi';
import type { DatasourceFormValues } from './datasource-form-schema';
import { makeEmptyOutputFieldRow } from './datasource-field-row-types';
import { DatasourceOutputFieldRow } from './datasource-output-field-row';

interface DatasourceOutputFieldsEditorProps {
  control: Control<DatasourceFormValues>;
  register: UseFormRegister<DatasourceFormValues>;
  watch: UseFormWatch<DatasourceFormValues>;
  setValue: UseFormSetValue<DatasourceFormValues>;
  errors: FieldErrors<DatasourceFormValues>;
}

/** `output` block of the visual field builder (follow-up to phase-03):
 * fields table (add/remove/reorder) + `timestampField`/`identityField`
 * (selects, so they can only ever point at a field that actually exists —
 * directly prevents the cross-field validation error the server checks
 * for) + `sortOrder`/paths + a collapsed `imageRef` advanced section.
 * Replaces the old raw-JSON `outputJson` textarea. */
export function DatasourceOutputFieldsEditor({ control, register, watch, setValue, errors }: DatasourceOutputFieldsEditorProps) {
  const t = vi.admin.datasources;
  const [imageRefExpanded, setImageRefExpanded] = useState(false);
  const { fields, append, remove, move } = useFieldArray({ control, name: 'outputFields' });
  const fieldNames = watch('outputFields').map((f) => f.name.trim()).filter(Boolean);
  const imageRefEnabled = watch('outputImageRefEnabled');

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <Label>{t.outputFieldsSectionTitle}</Label>
      {fields.map((field, index) => (
        <DatasourceOutputFieldRow
          key={field.id}
          index={index}
          register={register}
          watch={watch}
          setValue={setValue}
          errors={errors}
          canMoveUp={index > 0}
          canMoveDown={index < fields.length - 1}
          onRemove={() => remove(index)}
          onMoveUp={() => move(index, index - 1)}
          onMoveDown={() => move(index, index + 1)}
        />
      ))}
      {(errors.outputFields?.root?.message ?? errors.outputFields?.message) && (
        <p className="text-destructive text-sm">{errors.outputFields?.root?.message ?? errors.outputFields?.message}</p>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => append(makeEmptyOutputFieldRow())}>
        <Plus data-icon="inline-start" />
        {t.addFieldButton}
      </Button>

      <div className="mt-2 grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>{t.timestampFieldLabel}</Label>
          <Select value={watch('outputTimestampField')} onValueChange={(v) => setValue('outputTimestampField', v)}>
            <SelectTrigger className="w-full" aria-invalid={!!errors.outputTimestampField}>
              <SelectValue placeholder={t.selectFieldPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {fieldNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.outputTimestampField && <p className="text-destructive text-xs">{errors.outputTimestampField.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t.identityFieldLabel}</Label>
          <Select value={watch('outputIdentityField')} onValueChange={(v) => setValue('outputIdentityField', v)}>
            <SelectTrigger className="w-full" aria-invalid={!!errors.outputIdentityField}>
              <SelectValue placeholder={t.selectFieldPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {fieldNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.outputIdentityField && <p className="text-destructive text-xs">{errors.outputIdentityField.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t.sortOrderLabel}</Label>
          <Select value={watch('outputSortOrder')} onValueChange={(v) => setValue('outputSortOrder', v as 'asc' | 'desc')}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">{t.sortOrderDesc}</SelectItem>
              <SelectItem value="asc">{t.sortOrderAsc}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>{t.recordsPathLabel}</Label>
          <Input placeholder={t.recordsPathHint} {...register('outputRecordsPath')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t.totalPathLabel}</Label>
          <Input placeholder={t.totalPathHint} {...register('outputTotalPath')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t.requestIdPathLabel}</Label>
          <Input placeholder={t.requestIdPathHint} {...register('outputRequestIdPath')} />
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setImageRefExpanded((v) => !v)}>
          {imageRefExpanded ? <ChevronDown data-icon="inline-start" /> : <ChevronRight data-icon="inline-start" />}
          {t.imageRefAdvancedToggle}
        </Button>
        {imageRefExpanded && (
          <div className="flex flex-col gap-2 rounded-md border p-2">
            <div className="flex items-center gap-1.5">
              <Checkbox checked={imageRefEnabled} onCheckedChange={(c) => setValue('outputImageRefEnabled', c === true)} />
              <span className="text-xs">{t.imageRefEnableLabel}</span>
            </div>
            {imageRefEnabled && (
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder={t.imageRefBucketFieldLabel} {...register('outputImageRefBucketField')} />
                <Input placeholder={t.imageRefObjectKeyFieldLabel} {...register('outputImageRefObjectKeyField')} />
                <Input placeholder={t.imageRefMimeFieldLabel} {...register('outputImageRefMimeField')} />
              </div>
            )}
            {errors.outputImageRefMimeField && <p className="text-destructive text-xs">{errors.outputImageRefMimeField.message}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
