import { normalizeTimeZone } from '@app/shared';
import { isValidTimeZone, parseDateValue, parseWithFormat } from './date-format-parser.util';

describe('normalizeTimeZone: nhập "UTC+mấy" như người dùng quen', () => {
  it.each([
    ['UTC+7', 'Etc/GMT-7'], ['utc+07:00', 'Etc/GMT-7'], ['UTC + 7', 'Etc/GMT-7'], ['GMT+7', 'Etc/GMT-7'], ['+7', 'Etc/GMT-7'], ['+07:00', 'Etc/GMT-7'], ['UTC+0700', 'Etc/GMT-7'],
    ['UTC-5', 'Etc/GMT+5'], ['UTC-05:00', 'Etc/GMT+5'], ['UTC+14', 'Etc/GMT-14'], ['UTC-12', 'Etc/GMT+12'],
    ['UTC', 'UTC'], ['utc', 'UTC'], ['UTC+0', 'UTC'], ['UTC-0', 'UTC'],
    ['Asia/Ho_Chi_Minh', 'Asia/Ho_Chi_Minh'], ['  Asia/Tokyo ', 'Asia/Tokyo'],
  ])('%s -> %s', (input, expected) => expect(normalizeTimeZone(input)).toBe(expected));

  it('độ lệch lẻ giờ hoặc ngoài khoảng hợp lệ: giữ nguyên để bị báo không hợp lệ (dùng tên IANA)', () => {
    for (const bad of ['UTC+5:30', 'UTC+5:45', 'UTC+15', 'UTC-13', 'UTC+99']) {
      expect(normalizeTimeZone(bad)).toBe(bad);
      expect(isValidTimeZone(bad)).toBe(false);
    }
  });
});

describe('múi giờ dạng UTC±N dùng được ở API', () => {
  it('isValidTimeZone chấp nhận UTC+7, UTC-5; từ chối rác', () => {
    expect(isValidTimeZone('UTC+7')).toBe(true);
    expect(isValidTimeZone('UTC-5')).toBe(true);
    expect(isValidTimeZone('Asia/Ho_Chi_Minh')).toBe(true);
    expect(isValidTimeZone('UTC+abc')).toBe(false);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('UTC+7 cho kết quả GIỐNG HỆT Asia/Ho_Chi_Minh (Việt Nam không có giờ mùa hè)', () => {
    expect(parseDateValue('2024-10-15T09:43:27', undefined, 'UTC+7')).toBe('2024-10-15T02:43:27.000Z');
    expect(parseDateValue('2024-10-15T09:43:27', undefined, 'UTC+7')).toBe(parseDateValue('2024-10-15T09:43:27', undefined, 'Asia/Ho_Chi_Minh'));
    expect(parseWithFormat('10/12/2025 12:31:06', 'DD/MM/YYYY HH:mm:ss', 'UTC+07:00')).toBe('2025-12-10T05:31:06.000Z');
  });

  it('múi giờ phía tây: UTC-5 đọc 09:00 là 14:00Z; UTC+0 không lệch', () => {
    expect(parseDateValue('2024-01-15T09:00:00', undefined, 'UTC-5')).toBe('2024-01-15T14:00:00.000Z');
    expect(parseDateValue('2024-01-15T09:00:00', undefined, 'UTC+0')).toBe('2024-01-15T09:00:00.000Z');
  });
});
