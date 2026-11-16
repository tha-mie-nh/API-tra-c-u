import { useState } from 'react';
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatWithPattern } from '@/lib/format';
import { vi } from '@/i18n/vi';
import type { DatasourceFormValues } from './datasource-form-schema';

/** Presets offered in the dropdowns; anything else goes through "Tùy chỉnh" (free text). */
const SOURCE_PRESETS = [
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'DD/MM/YYYY HH:mm:ss',
  'DD/MM/YYYY HH:mm',
  'DD/MM/YYYY HH:mm:ss|DD/MM/YYYY HH:mm|DD/MM/YYYY',
];
/** Formats an upstream may expect for a date/datetime the user picked in the search form (default is ISO YYYY-MM-DD). */
export const INPUT_SEND_PRESETS = ['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYYMMDD', 'YYYY-MM-DD HH:mm:ss', 'DD/MM/YYYY HH:mm:ss', 'YYYYMMDDHHmmss'];
const DISPLAY_PRESETS = ['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY HH:mm', 'DD/MM/YYYY HH:mm:ss', 'HH:mm DD/MM/YYYY'];
const TIME_ZONES = ['UTC', 'Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London', 'America/New_York'];
const DEFAULT_VALUE = '__default__';
const CUSTOM_VALUE = '__custom__';
/** 09:30 on 2026-01-15 in Asia/Ho_Chi_Minh — a fixed example so the preview is stable. */
const PREVIEW_ISO = '2026-01-15T02:30:00Z';

interface DateFormatSelectProps {
  label: string;
  hint: string;
  defaultLabel: string;
  presets: string[];
  value: string;
  onChange: (value: string) => void;
  register: ReturnType<UseFormRegister<DatasourceFormValues>>;
  preview?: boolean;
  /** Zone used to render the preview (input formats re-arrange digits as typed, so they preview in UTC = no shift). */
  previewTimeZone?: string;
}

export function DateFormatSelect({ label, hint, defaultLabel, presets, value, onChange, register, preview, previewTimeZone }: DateFormatSelectProps) {
  const t = vi.admin.datasources;
  const isPreset = value === '' || presets.includes(value);
  const [custom, setCustom] = useState(!isPreset);
  const mode = custom || !isPreset ? CUSTOM_VALUE : value === '' ? DEFAULT_VALUE : value;
  const example = preview && value ? formatWithPattern(PREVIEW_ISO, value, previewTimeZone) : null;

  return (
    <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      <Select
        value={mode}
        onValueChange={(v) => {
          if (!v) return;
          setCustom(v === CUSTOM_VALUE);
          if (v === CUSTOM_VALUE) return;
          onChange(v === DEFAULT_VALUE ? '' : v);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_VALUE}>{defaultLabel}</SelectItem>
          {presets.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_VALUE}>{t.dateFormatCustomOption}</SelectItem>
        </SelectContent>
      </Select>
      {mode === CUSTOM_VALUE && <Input placeholder="DD/MM/YYYY HH:mm" {...register} />}
      <span className="text-muted-foreground text-xs">{example ? `${t.dateFormatExample} ${example}` : hint}</span>
    </div>
  );
}

interface DatasourceOutputDateFormatFieldsProps {
  index: number;
  register: UseFormRegister<DatasourceFormValues>;
  watch: UseFormWatch<DatasourceFormValues>;
  setValue: UseFormSetValue<DatasourceFormValues>;
}

/** Shown on the main row of an output field whose type is `date`/`datetime`: how the upstream value is read (`format`,
 * i.e. the string -> date conversion) and how it is shown to users (`displayFormat`). */
export function DatasourceOutputDateFormatFields({ index, register, watch, setValue }: DatasourceOutputDateFormatFieldsProps) {
  const t = vi.admin.datasources;
  const row = watch(`outputFields.${index}`);
  return (
    <div className="flex flex-wrap gap-3 pl-8">
      <DateFormatSelect
        label={t.outputFieldFormat}
        hint={t.outputFieldFormatHint}
        defaultLabel={t.dateFormatSourceDefault}
        presets={SOURCE_PRESETS}
        value={row.format}
        onChange={(v) => setValue(`outputFields.${index}.format`, v)}
        register={register(`outputFields.${index}.format`)}
      />
      <DateFormatSelect
        label={t.outputFieldDisplayFormat}
        hint={t.outputFieldDisplayFormatHint}
        defaultLabel={t.dateFormatDisplayDefault}
        presets={DISPLAY_PRESETS}
        value={row.displayFormat}
        onChange={(v) => setValue(`outputFields.${index}.displayFormat`, v)}
        register={register(`outputFields.${index}.displayFormat`)}
        preview
      />
      <DateFormatSelect
        label={t.timeZoneSourceLabel}
        hint={t.timeZoneSourceHint}
        defaultLabel={t.timeZoneSourceDefault}
        presets={TIME_ZONES}
        value={row.sourceTimeZone}
        onChange={(v) => setValue(`outputFields.${index}.sourceTimeZone`, v)}
        register={register(`outputFields.${index}.sourceTimeZone`)}
      />
      <DateFormatSelect
        label={t.timeZoneDisplayLabel}
        hint={t.timeZoneDisplayHint}
        defaultLabel={t.timeZoneDisplayDefault}
        presets={TIME_ZONES}
        value={row.displayTimeZone}
        onChange={(v) => setValue(`outputFields.${index}.displayTimeZone`, v)}
        register={register(`outputFields.${index}.displayTimeZone`)}
      />
    </div>
  );
}
