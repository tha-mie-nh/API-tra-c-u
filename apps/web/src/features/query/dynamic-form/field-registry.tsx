import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import type { InputFieldDef } from '@shared/index';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { vi } from '@/i18n/vi';
import { DateTextInput } from '@/components/common/date-text-input';

/** Radix `<Select>` cannot carry an empty-string item value — this sentinel
 * represents "no selection" for optional enum fields and is translated back
 * to `''` (→ "not provided", see build-zod-schema.ts) in `onValueChange`. */
const SELECT_EMPTY_VALUE = '__none__';

interface RhfFieldLike {
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
}

interface DynamicFieldProps {
  field: InputFieldDef;
  control: Control<FieldValues>;
  error?: { message?: string };
}

/**
 * One `<Label> + <control>` pair for a single `input.fields[]` entry — the
 * field-type -> shadcn-control mapping (phase-07 Implementation Step 3).
 * This is the ONLY place a field `type` is switched on; datasource `code` is
 * never referenced here (phase-07 Key Insight "Zero per-API code").
 */
export function DynamicField({ field, control, error }: DynamicFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={field.name}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      <Controller
        name={field.name as Path<FieldValues>}
        control={control}
        render={({ field: rhf }) => renderControl(field, rhf, !!error)}
      />
      {error?.message && <p className="text-destructive text-sm">{error.message}</p>}
    </div>
  );
}

function renderControl(field: InputFieldDef, rhf: RhfFieldLike, invalid: boolean) {
  const stringValue = typeof rhf.value === 'string' ? rhf.value : '';

  switch (field.type) {
    case 'number':
      return (
        <Input
          id={field.name}
          type="number"
          aria-invalid={invalid}
          value={stringValue}
          onChange={(e) => rhf.onChange(e.target.value)}
          onBlur={rhf.onBlur}
        />
      );
    case 'date':
      return (
        <DateTextInput
          id={field.name}
          invalid={invalid}
          value={stringValue}
          onChange={rhf.onChange}
          onBlur={rhf.onBlur}
        />
      );
    case 'datetime':
      return (
        <Input
          id={field.name}
          type="datetime-local"
          aria-invalid={invalid}
          value={toLocalDatetime(stringValue)}
          onChange={(e) => rhf.onChange(fromLocalDatetime(e.target.value))}
          onBlur={rhf.onBlur}
        />
      );
    case 'boolean':
      return (
        <Checkbox
          id={field.name}
          checked={rhf.value === true}
          onCheckedChange={(checked) => rhf.onChange(checked === true)}
        />
      );
    case 'enum':
      return (
        <Select
          value={stringValue || SELECT_EMPTY_VALUE}
          onValueChange={(value) => rhf.onChange(value === SELECT_EMPTY_VALUE ? '' : value)}
        >
          <SelectTrigger id={field.name} className="w-full" aria-invalid={invalid}>
            <SelectValue placeholder={vi.query.selectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {!field.required && <SelectItem value={SELECT_EMPTY_VALUE}>{vi.query.selectPlaceholder}</SelectItem>}
            {(field.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'string':
      return (
        <Input
          id={field.name}
          aria-invalid={invalid}
          autoComplete="off"
          value={stringValue}
          onChange={(e) => rhf.onChange(e.target.value)}
          onBlur={rhf.onBlur}
        />
      );
    default:
      // Never crash on a config field type this registry doesn't know about
      // yet (phase-07 Risk Assessment) — render text and log, once per field.
      console.warn(`[field-registry] Unknown input field type "${String(field.type)}" for "${field.name}" — rendering as text.`);
      return (
        <Input
          id={field.name}
          aria-invalid={invalid}
          value={stringValue}
          onChange={(e) => rhf.onChange(e.target.value)}
          onBlur={rhf.onBlur}
        />
      );
  }
}

/** `<input type="datetime-local">` uses `YYYY-MM-DDTHH:mm` (no seconds); the
 * backend's `datetime` regex requires seconds — convert at the UI boundary
 * only, so the shared zod schema stays a pure mirror of the backend rule. */
function toLocalDatetime(value: string): string {
  return value.length >= 16 ? value.slice(0, 16) : value;
}

function fromLocalDatetime(value: string): string {
  return value.length === 16 ? `${value}:00` : value;
}
