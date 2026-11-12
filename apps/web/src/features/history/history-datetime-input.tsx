import { useEffect, useRef, useState } from 'react';
import { vnDateStartIso } from '@shared/index';
import { DateTextInput } from '@/components/common/date-text-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { vi } from '@/i18n/vi';

const VN_OFFSET_MS = 7 * 3_600_000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type DatetimeKind = 'from' | 'to';
const MINUTE_MS = 60_000;

/**
 * URL value (YYYY-MM-DD or ISO instant) -> VN-local date + HH:mm ('' time for date-only).
 * For `to` the instant is the EXCLUSIVE end (picked minute + 1), so one minute is subtracted back.
 */
export function splitVnDateTime(value: string | undefined, kind: DatetimeKind = 'from'): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  if (YMD.test(value)) return { date: value, time: '' };
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return { date: '', time: '' };
  const vn = new Date(ms + VN_OFFSET_MS - (kind === 'to' ? MINUTE_MS : 0)).toISOString();
  return { date: vn.slice(0, 10), time: vn.slice(11, 16) };
}

/**
 * VN date (+ optional HH:mm) -> URL value; no time => date-only (backend: `to` = whole day).
 * `to` + time is inclusive of the picked minute: emitted bound is the NEXT minute (backend upper bound is exclusive),
 * so choosing 23:59 includes 23:59:00-23:59:59.999.
 */
export function joinVnDateTime(date: string, time: string, kind: DatetimeKind = 'from'): string | undefined {
  if (!YMD.test(date)) return undefined;
  const m = HHMM.exec(time);
  if (!m) return date;
  const minutes = Number(m[1]) * 60 + Number(m[2]) + (kind === 'to' ? 1 : 0);
  return new Date(Date.parse(vnDateStartIso(date)) + minutes * MINUTE_MS).toISOString();
}

interface Props {
  id: string;
  kind: DatetimeKind;
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

/** Date (dd-mm-yyyy) + optional time (HH:mm), both Asia/Ho_Chi_Minh. */
export function HistoryDatetimeInput({ id, kind, label, value, onChange }: Props) {
  const [parts, setParts] = useState(() => splitVnDateTime(value, kind));
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setParts(splitVnDateTime(value, kind));
    }
  }, [value]);

  const update = (next: { date: string; time: string }) => {
    setParts(next);
    const out = joinVnDateTime(next.date, next.time, kind);
    lastEmitted.current = out;
    onChange(out);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{vi.history.filterTimeLabel(label)}</Label>
      <div className="flex gap-2">
        <div className="flex-1">
          <DateTextInput
            id={id}
            invalid={false}
            value={parts.date}
            onChange={(date) => update({ ...parts, date })}
            onBlur={() => {}}
          />
        </div>
        <Input
          type="time"
          aria-label={`${label} — ${vi.history.filterTimeOptional}`}
          className="w-28"
          value={parts.time}
          onChange={(e) => update({ ...parts, time: e.target.value })}
        />
      </div>
    </div>
  );
}
