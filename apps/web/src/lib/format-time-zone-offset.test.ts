import { describe, expect, it } from 'vitest';
import { formatDateTime, formatWithPattern } from './format';

describe('hiển thị theo múi giờ nhập dạng UTC±N', () => {
  const ISO = '2026-01-15T02:30:00.000Z';
  it('UTC+7 hiển thị giống Asia/Ho_Chi_Minh; UTC+9 ra giờ Nhật; UTC-5 ra giờ New York mùa đông', () => {
    expect(formatWithPattern(ISO, 'DD/MM/YYYY HH:mm', 'UTC+7')).toBe('15/01/2026 09:30');
    expect(formatWithPattern(ISO, 'DD/MM/YYYY HH:mm', 'UTC+7')).toBe(formatWithPattern(ISO, 'DD/MM/YYYY HH:mm', 'Asia/Ho_Chi_Minh'));
    expect(formatWithPattern(ISO, 'DD/MM/YYYY HH:mm', 'UTC+9')).toBe('15/01/2026 11:30');
    expect(formatWithPattern(ISO, 'DD/MM/YYYY HH:mm', 'UTC-5')).toBe('14/01/2026 21:30');
    expect(formatDateTime(ISO, 'UTC+0')).toBe('15-01-2026 02:30');
  });
  it('múi giờ không hợp lệ: không bịa giờ, trả null', () => {
    expect(formatWithPattern(ISO, 'HH:mm', 'UTC+5:30')).toBeNull();
    expect(formatWithPattern(ISO, 'HH:mm', 'abc')).toBeNull();
  });
});
