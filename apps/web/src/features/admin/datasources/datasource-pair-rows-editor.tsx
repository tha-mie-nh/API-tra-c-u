import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { vi } from '@/i18n/vi';

interface PairRowsEditorProps<T extends Record<string, string>> {
  rows: T[];
  onRowsChange: (rows: T[]) => void;
  firstField: keyof T;
  secondField: keyof T;
  firstPlaceholder: string;
  secondPlaceholder: string;
  addButtonLabel: string;
  makeEmptyRow: () => T;
}

/**
 * Generic controlled 2-column row list — reused for `inputField.options`
 * (value/label), `outputField.valueMap`/`iconMap` (key/value). Deliberately
 * NOT wired through `useFieldArray` (these are nested one level inside an
 * already-array-typed row — `watch`/`setValue` on the parent row's array
 * value keeps the typing simple, matching the "keep it minimal, no fancy
 * machinery" guidance for these rarely-touched sub-lists).
 */
export function PairRowsEditor<T extends Record<string, string>>({
  rows,
  onRowsChange,
  firstField,
  secondField,
  firstPlaceholder,
  secondPlaceholder,
  addButtonLabel,
  makeEmptyRow,
}: PairRowsEditorProps<T>) {
  const updateRow = (index: number, field: keyof T, value: string) => {
    onRowsChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };
  const removeRow = (index: number) => onRowsChange(rows.filter((_, i) => i !== index));
  const addRow = () => onRowsChange([...rows, makeEmptyRow()]);

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2">
          <Input
            placeholder={firstPlaceholder}
            value={row[firstField]}
            onChange={(e) => updateRow(i, firstField, e.target.value)}
          />
          <Input
            placeholder={secondPlaceholder}
            value={row[secondField]}
            onChange={(e) => updateRow(i, secondField, e.target.value)}
          />
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeRow(i)} aria-label={vi.admin.datasources.removeRowButton}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus data-icon="inline-start" />
        {addButtonLabel}
      </Button>
    </div>
  );
}
