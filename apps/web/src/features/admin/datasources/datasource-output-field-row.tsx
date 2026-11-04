import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { vi } from '@/i18n/vi';
import type { DatasourceFormValues } from './datasource-form-schema';
import { FIELD_TYPE_VALUES, makeEmptyKeyValueRow } from './datasource-field-row-types';
import { PairRowsEditor } from './datasource-pair-rows-editor';

interface DatasourceOutputFieldRowProps {
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

const BOOLEAN_FLAGS = ['sensitive', 'internal', 'emphasize', 'headerField'] as const;

/** One row of the output-fields table (`datasource-output-fields-editor.tsx`):
 * name/label/from/type always visible, `valueMap`/`iconMap`/4 booleans
 * behind an expand toggle (phase-03 follow-up scope). */
export function DatasourceOutputFieldRow({
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
}: DatasourceOutputFieldRowProps) {
  const [expanded, setExpanded] = useState(false);
  const t = vi.admin.datasources;
  const row = watch(`outputFields.${index}`);
  const rowErrors = errors.outputFields?.[index];

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setExpanded((v) => !v)} aria-label={t.expandRowButton}>
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </Button>
        <Input className="flex-1" placeholder={t.fieldRowName} aria-invalid={!!rowErrors?.name} {...register(`outputFields.${index}.name`)} />
        <Input className="flex-1" placeholder={t.fieldRowLabel} aria-invalid={!!rowErrors?.label} {...register(`outputFields.${index}.label`)} />
        <Input className="flex-1" placeholder={t.outputFieldFrom} title={t.outputFieldFromHint} {...register(`outputFields.${index}.from`)} />
        <Select value={row.type} onValueChange={(v) => setValue(`outputFields.${index}.type`, v as (typeof FIELD_TYPE_VALUES)[number])}>
          <SelectTrigger className="w-36">
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
      {(rowErrors?.name || rowErrors?.label) && (
        <p className="text-destructive text-xs">{rowErrors?.name?.message ?? rowErrors?.label?.message}</p>
      )}

      {expanded && (
        <div className="flex flex-col gap-2 border-t pt-2 pl-8">
          <div className="flex flex-wrap gap-3">
            {BOOLEAN_FLAGS.map((flag) => (
              <div key={flag} className="flex items-center gap-1.5">
                <Checkbox checked={row[flag]} onCheckedChange={(c) => setValue(`outputFields.${index}.${flag}`, c === true)} />
                <span className="text-xs">{t.outputFieldFlagLabels[flag]}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">{t.outputFieldValueMap}</span>
              <PairRowsEditor
                rows={row.valueMap}
                onRowsChange={(rows) => setValue(`outputFields.${index}.valueMap`, rows)}
                firstField="key"
                secondField="value"
                firstPlaceholder={t.keyValueKeyPlaceholder}
                secondPlaceholder={t.keyValueValuePlaceholder}
                addButtonLabel={t.addMapRowButton}
                makeEmptyRow={makeEmptyKeyValueRow}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">{t.outputFieldIconMap}</span>
              <PairRowsEditor
                rows={row.iconMap}
                onRowsChange={(rows) => setValue(`outputFields.${index}.iconMap`, rows)}
                firstField="key"
                secondField="value"
                firstPlaceholder={t.keyValueKeyPlaceholder}
                secondPlaceholder={t.keyValueValuePlaceholder}
                addButtonLabel={t.addMapRowButton}
                makeEmptyRow={makeEmptyKeyValueRow}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
