import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

function isoToDisplay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return '';
  const [, y, m, d] = match;
  return `${d}-${m}-${y}`;
}

function displayToIso(display: string): string {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(display);
  if (!match) return '';
  const [, d, m, y] = match;
  return `${y}-${m}-${d}`;
}

/** Auto-inserts the `-` separators as digits are typed, building up `dd-mm-yyyy`. */
function maskDigitsAsDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('-');
}

interface DateTextInputProps {
  id: string;
  invalid: boolean;
  value: string;
  onChange: (isoValue: string) => void;
  onBlur: () => void;
}

/**
 * Text-masked replacement for `<input type="date">` (review feedback: the
 * native control's placeholder/format follows the BROWSER's own locale, not
 * the page — `<html lang="vi">` has no effect on it — so a `vi-VN` user on an
 * `en-US`-configured browser still sees `mm/dd/yyyy`). This renders the
 * site-wide `dd-mm-yyyy` convention unconditionally; the value handed to
 * `onChange` stays ISO `yyyy-mm-dd`, exactly what `build-zod-schema.ts`'s
 * `DATE_RE` and the backend both expect — only the on-screen text differs.
 */
export function DateTextInput({ id, invalid, value, onChange, onBlur }: DateTextInputProps) {
  const [display, setDisplay] = useState(() => isoToDisplay(value));
  const lastEmitted = useRef(value);

  // Resync only on an EXTERNAL value change (e.g. the form's "Đặt lại" reset)
  // — not after our own onChange, which would wipe a still-incomplete
  // in-progress date the user is typing.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setDisplay(isoToDisplay(value));
    }
  }, [value]);

  return (
    <Input
      id={id}
      inputMode="numeric"
      placeholder="dd-mm-yyyy"
      maxLength={10}
      aria-invalid={invalid}
      value={display}
      onChange={(e) => {
        const masked = maskDigitsAsDate(e.target.value);
        setDisplay(masked);
        const iso = displayToIso(masked);
        lastEmitted.current = iso;
        onChange(iso);
      }}
      onBlur={onBlur}
    />
  );
}
