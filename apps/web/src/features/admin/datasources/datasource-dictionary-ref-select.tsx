import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminDictionaries } from '@/features/admin/dictionaries/dictionaries-api';
import { vi } from '@/i18n/vi';

const NONE = '__none__';

interface DictionaryRefSelectProps {
  value: string;
  onChange: (value: string) => void;
}

/** Picks a named dictionary (Danh mục) or "Nhập tay". A referenced name that is missing from the list
 * is still shown (never silently blanked), so a stored `optionsRef`/`valueMapRef` is always visible. */
export function DictionaryRefSelect({ value, onChange }: DictionaryRefSelectProps) {
  const t = vi.admin.datasources;
  const { data } = useAdminDictionaries();
  const names = Array.from(new Set([...(data ?? []).map((d) => d.name), ...(value ? [value] : [])]));

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">{t.dictionaryPick}</span>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t.dictionaryNone}</SelectItem>
          {names.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground text-xs">{t.dictionaryHint}</span>
    </div>
  );
}
