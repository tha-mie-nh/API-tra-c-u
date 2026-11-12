/** Pure helpers, fixed UTC+7 (Asia/Ho_Chi_Minh has no DST). Output ISO UTC, half-open [from, to). */

const VN_OFFSET_HOURS = 7;

export interface IsoRange {
  from: string;
  to: string;
}

function vnToIso(y: number, monthIdx: number, d: number, h = 0): string {
  return new Date(Date.UTC(y, monthIdx, d, h - VN_OFFSET_HOURS)).toISOString();
}

/** Bucket key ('YYYY-MM-DDTHH' | 'YYYY-MM-DD' | 'YYYY-MM', VN local) -> ISO UTC range. */
export function vnBucketRange(bucket: string, granularity: 'hour' | 'day' | 'month'): IsoRange {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2})(?:T(\d{2}))?)?$/.exec(bucket);
  if (!m) throw new Error(`Invalid bucket: ${bucket}`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = m[3] ? Number(m[3]) : 1;
  const h = m[4] ? Number(m[4]) : 0;
  if (granularity === 'hour') return { from: vnToIso(y, mo, d, h), to: vnToIso(y, mo, d, h + 1) };
  if (granularity === 'day') return { from: vnToIso(y, mo, d), to: vnToIso(y, mo, d + 1) };
  return { from: vnToIso(y, mo, 1), to: vnToIso(y, mo + 1, 1) };
}

/** 'YYYY-MM-DD' -> ISO UTC of 00:00 VN that day. */
export function vnDateStartIso(date: string): string {
  return vnBucketRange(date, 'day').from;
}

/** 'YYYY-MM-DD' -> ISO UTC of 00:00 VN of the NEXT day (exclusive end of that day). */
export function vnNextDateStartIso(date: string): string {
  return vnBucketRange(date, 'day').to;
}
