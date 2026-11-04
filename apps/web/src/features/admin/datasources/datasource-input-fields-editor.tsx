import { useFieldArray, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue, type UseFormWatch } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { vi } from '@/i18n/vi';
import type { DatasourceFormValues } from './datasource-form-schema';
import { makeEmptyInputFieldRow } from './datasource-field-row-types';
import { DatasourceInputFieldRow } from './datasource-input-field-row';

interface DatasourceInputFieldsEditorProps {
  control: Control<DatasourceFormValues>;
  register: UseFormRegister<DatasourceFormValues>;
  watch: UseFormWatch<DatasourceFormValues>;
  setValue: UseFormSetValue<DatasourceFormValues>;
  errors: FieldErrors<DatasourceFormValues>;
}

/** `input` block of the visual field builder (follow-up to phase-03):
 * fields table (add/remove/reorder) + `atLeastOneOf` + `requireGroups`,
 * replacing the old raw-JSON `inputJson` textarea. */
export function DatasourceInputFieldsEditor({ control, register, watch, setValue, errors }: DatasourceInputFieldsEditorProps) {
  const t = vi.admin.datasources;
  const { fields, append, remove, move } = useFieldArray({ control, name: 'inputFields' });
  const fieldNames = watch('inputFields').map((f) => f.name.trim()).filter(Boolean);
  const atLeastOneOf = watch('inputAtLeastOneOf');
  const requireGroups = watch('inputRequireGroups');

  const toggleAtLeastOneOf = (name: string, checked: boolean) => {
    setValue('inputAtLeastOneOf', checked ? [...atLeastOneOf, name] : atLeastOneOf.filter((n) => n !== name));
  };
  const toggleGroupMember = (groupIndex: number, name: string, checked: boolean) => {
    const group = requireGroups[groupIndex] ?? [];
    const next = checked ? [...group, name] : group.filter((n) => n !== name);
    setValue('inputRequireGroups', requireGroups.map((g, i) => (i === groupIndex ? next : g)));
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <Label>{t.inputFieldsSectionTitle}</Label>
      {fields.map((field, index) => (
        <DatasourceInputFieldRow
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
      {(errors.inputFields?.root?.message ?? errors.inputFields?.message) && (
        <p className="text-destructive text-sm">{errors.inputFields?.root?.message ?? errors.inputFields?.message}</p>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => append(makeEmptyInputFieldRow())}>
        <Plus data-icon="inline-start" />
        {t.addFieldButton}
      </Button>

      <div className="mt-2 flex flex-col gap-1.5">
        <Label>{t.atLeastOneOfLabel}</Label>
        <p className="text-muted-foreground text-xs">{t.atLeastOneOfHint}</p>
        <div className="flex flex-wrap gap-3">
          {fieldNames.map((name) => (
            <div key={name} className="flex items-center gap-1.5">
              <Checkbox checked={atLeastOneOf.includes(name)} onCheckedChange={(c) => toggleAtLeastOneOf(name, c === true)} />
              <span className="text-xs">{name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-1.5">
        <Label>{t.requireGroupsLabel}</Label>
        <p className="text-muted-foreground text-xs">{t.requireGroupsHint}</p>
        {requireGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="flex items-center gap-3 rounded-md border p-2">
            <div className="flex flex-1 flex-wrap gap-3">
              {fieldNames.map((name) => (
                <div key={name} className="flex items-center gap-1.5">
                  <Checkbox checked={group.includes(name)} onCheckedChange={(c) => toggleGroupMember(groupIndex, name, c === true)} />
                  <span className="text-xs">{name}</span>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setValue('inputRequireGroups', requireGroups.filter((_, i) => i !== groupIndex))}
              aria-label={t.removeRowButton}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setValue('inputRequireGroups', [...requireGroups, []])}>
          <Plus data-icon="inline-start" />
          {t.addRequireGroupButton}
        </Button>
      </div>
    </div>
  );
}
