import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { vi } from '@/i18n/vi';
import type { DatasourceFormValues } from './datasource-form-schema';
import { FIELD_TYPE_VALUES, makeEmptyFieldOptionRow } from './datasource-field-row-types';
import { PairRowsEditor } from './datasource-pair-rows-editor';

interface DatasourceInputFieldRowProps {
  index: number;
  register: UseFormRegister<DatasourceFormValues>;
  watch: UseFormWatch<DatasourceFormValues>;
  setValue: UseFormSetValue<DatasourceFormValues>;
  errors: FieldErrors<DatasourceFormValues>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/** One row of the input-fields table (`datasource-input-fields-editor.tsx`):
 * name/label/type/required always visible, the rest of `inputField`
 * (phase-03 follow-up scope) behind an expand toggle. */
export function DatasourceInputFieldRow({
  index,
  register,
  watch,
  setValue,
  errors,
  canMoveUp,
  canMoveDown,
  onRemove,
  onMoveUp,
  onMoveDown,
}: DatasourceInputFieldRowProps) {
  const [expanded, setExpanded] = useState(false);
  const t = vi.admin.datasources;
  const row = watch(`inputFields.${index}`);
  const rowErrors = errors.inputFields?.[index];

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" onClick={() => setExpanded((v) => !v)} aria-label={t.expandRowButton}>
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </Button>
        <Input
          className="min-w-[110px] flex-1 basis-32"
          placeholder={t.fieldRowName}
          aria-invalid={!!rowErrors?.name}
          {...register(`inputFields.${index}.name`)}
        />
        <Input
          className="min-w-[110px] flex-1 basis-32"
          placeholder={t.fieldRowLabel}
          aria-invalid={!!rowErrors?.label}
          {...register(`inputFields.${index}.label`)}
        />
        <Select value={row.type} onValueChange={(v) => setValue(`inputFields.${index}.type`, v as (typeof FIELD_TYPE_VALUES)[number])}>
          <SelectTrigger className="w-36 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPE_VALUES.map((type) => (
              <SelectItem key={type} value={type}>
                {t.fieldTypeLabels[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex shrink-0 items-center gap-1">
          <Checkbox checked={row.required} onCheckedChange={(c) => setValue(`inputFields.${index}.required`, c === true)} />
          <span className="text-xs">{t.fieldRowRequired}</span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onMoveUp} disabled={!canMoveUp} aria-label={t.moveRowUpButton}>
            ^
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onMoveDown} disabled={!canMoveDown} aria-label={t.moveRowDownButton}>
            v
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={t.removeRowButton}>
            <Trash2 />
          </Button>
        </div>
      </div>
      {(rowErrors?.name || rowErrors?.label) && (
        <p className="text-destructive text-xs">{rowErrors?.name?.message ?? rowErrors?.label?.message}</p>
      )}

      {expanded && (
        <div className="grid grid-cols-2 gap-2 border-t pt-2 pl-8">
          <Input placeholder={t.fieldRowMinLength} type="number" {...register(`inputFields.${index}.minLength`)} />
          <Input placeholder={t.fieldRowMaxLength} type="number" {...register(`inputFields.${index}.maxLength`)} />
          <Input placeholder={t.fieldRowMin} type="number" {...register(`inputFields.${index}.min`)} />
          <Input placeholder={t.fieldRowMax} type="number" {...register(`inputFields.${index}.max`)} />
          <Input placeholder={t.fieldRowPattern} {...register(`inputFields.${index}.pattern`)} />
          <Input placeholder={t.fieldRowFormat} {...register(`inputFields.${index}.format`)} />
          <Input placeholder={t.fieldRowMapTo} {...register(`inputFields.${index}.mapTo`)} />
          {row.type === 'enum' && (
            <div className="col-span-2 flex flex-col gap-1.5">
              <span className="text-xs font-medium">{t.fieldRowOptions}</span>
              <PairRowsEditor
                rows={row.options}
                onRowsChange={(options) => setValue(`inputFields.${index}.options`, options)}
                firstField="value"
                secondField="label"
                firstPlaceholder={t.fieldRowOptionValue}
                secondPlaceholder={t.fieldRowOptionLabel}
                addButtonLabel={t.addOptionButton}
                makeEmptyRow={makeEmptyFieldOptionRow}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
