/**
 * Chuẩn hóa múi giờ người dùng nhập (config.json / form quản trị) về tên IANA mà `Intl` hiểu.
 *   "UTC+7", "utc+07:00", "GMT-5", "+7"  -> "Etc/GMT-7", "Etc/GMT+5"  (đúng giờ nguyên)
 *   "UTC", "UTC+0"                      -> "UTC"
 *   "Asia/Ho_Chi_Minh"                  -> giữ nguyên
 * Lưu ý dấu của tên `Etc/GMT±N` bị đảo theo chuẩn POSIX (Etc/GMT-7 = UTC+7); hàm này lo việc đảo đó để người dùng viết như quen.
 * Độ lệch lẻ giờ (UTC+5:30, UTC+5:45...) không có tên `Etc/` tương ứng: trả nguyên văn (Intl sẽ báo không hợp lệ);
 * hãy dùng tên IANA của vùng đó (Asia/Kolkata, Asia/Kathmandu...).
 */
const OFFSET_RE = /^(?:UTC|GMT)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i;

export function normalizeTimeZone(input: string): string {
  const text = input.trim();
  if (/^(UTC|GMT)$/i.test(text)) return 'UTC';
  const m = OFFSET_RE.exec(text);
  if (!m) return text;
  const sign = m[1] as '+' | '-';
  const hours = Number(m[2]);
  const minutes = Number(m[3] ?? '0');
  if (minutes !== 0 || hours > 14 || (sign === '-' && hours > 12)) return text;
  if (hours === 0) return 'UTC';
  return `Etc/GMT${sign === '+' ? '-' : '+'}${hours}`;
}
