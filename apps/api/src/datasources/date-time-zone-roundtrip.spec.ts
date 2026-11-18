import type { DatasourceEntry } from '@app/shared';
import { ResponseMapperService } from './response-mapper.service';

/**
 * Kiểm tra giờ ĐI QUA CẢ HAI ĐẦU: upstream trả chuỗi giờ -> API chuẩn hóa thành ISO UTC -> trình duyệt hiển thị theo
 * múi giờ hiển thị (mặc định Asia/Ho_Chi_Minh). `displayIn` mô phỏng đúng cách web hiển thị (Intl, không phụ thuộc múi
 * giờ máy). Chạy lặp với nhiều `TZ` của tiến trình để chứng minh kết quả KHÔNG phụ thuộc múi giờ máy chủ:
 *   for tz in UTC Asia/Ho_Chi_Minh America/Los_Angeles Pacific/Auckland; do TZ=$tz pnpm exec jest date-time-zone-roundtrip; done
 */
const mapper = new ResponseMapperService();
const HCM = 'Asia/Ho_Chi_Minh';

function displayIn(iso: string, zone: string, withTime = true): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}/${g('month')}/${g('year')}${withTime ? ` ${g('hour')}:${g('minute')}:${g('second')}` : ''}`;
}

function run(rawValue: string, type: 'date' | 'datetime', format?: string, sourceTimeZone?: string): string {
  const ds = {
    code: 'T', name: 'T', type: 'info', enabled: true, permissionCode: 'api:t', transport: { kind: 'http', baseUrl: 'http://x', path: '/', method: 'GET' }, input: { fields: [] },
    output: { timestampField: 'ts', sortOrder: 'desc', identityField: 'id', fields: [{ name: 'id', label: 'id', type: 'string' }, { name: 'ts', label: 'ts', type: type, ...(format ? { format } : {}), ...(sourceTimeZone ? { sourceTimeZone } : {}) }] },
    limits: { maxResults: 10, pageSize: 10 },
  } as unknown as DatasourceEntry;
  const env = mapper.map([{ id: '1', ts: rawValue }], ds, { requestId: 'r', tookMs: 1 });
  return String(env.groups[0]?.records[0]?.ts);
}

describe(`giờ đi hai đầu (TZ tiến trình = ${process.env.TZ ?? '(mặc định)'})`, () => {
  describe('chuỗi giờ KHÔNG có múi giờ', () => {
    it('mặc định coi là UTC: 09:43:27 hiển thị ở Việt Nam là 16:43:27 (+7)', () => {
      const iso = run('2024-10-15T09:43:27', 'datetime');
      expect(iso).toBe('2024-10-15T09:43:27.000Z');
      expect(displayIn(iso, HCM)).toBe('15/10/2024 16:43:27');
    });

    it('khai báo sourceTimeZone = Asia/Ho_Chi_Minh thì giờ hiển thị đúng bằng giờ upstream gửi', () => {
      const iso = run('2024-10-15T09:43:27', 'datetime', undefined, HCM);
      expect(iso).toBe('2024-10-15T02:43:27.000Z');
      expect(displayIn(iso, HCM)).toBe('15/10/2024 09:43:27');
    });

    it('format DD/MM/YYYY HH:mm:ss: mặc định UTC (+7 khi hiển thị), có sourceTimeZone thì khớp giờ gốc', () => {
      expect(displayIn(run('10/12/2025 12:31:06', 'datetime', 'DD/MM/YYYY HH:mm:ss'), HCM)).toBe('10/12/2025 19:31:06');
      expect(displayIn(run('10/12/2025 12:31:06', 'datetime', 'DD/MM/YYYY HH:mm:ss', HCM), HCM)).toBe('10/12/2025 12:31:06');
    });

    it('sát nửa đêm: 23:30 giờ VN không lùi/tiến sang ngày khác khi khai báo đúng sourceTimeZone', () => {
      expect(displayIn(run('2026-01-31 23:30:00', 'datetime', undefined, HCM), HCM)).toBe('31/01/2026 23:30:00');
      expect(displayIn(run('01/03/2026 00:15:00', 'datetime', 'DD/MM/YYYY HH:mm:ss', HCM), HCM)).toBe('01/03/2026 00:15:00');
    });

    it('giao năm và năm nhuận: 29/02/2028 23:59:59 và 31/12 23:59:59', () => {
      expect(displayIn(run('29/02/2028 23:59:59', 'datetime', 'DD/MM/YYYY HH:mm:ss', HCM), HCM)).toBe('29/02/2028 23:59:59');
      expect(displayIn(run('2025-12-31T23:59:59', 'datetime', undefined, HCM), HCM)).toBe('31/12/2025 23:59:59');
    });
  });

  describe('chuỗi giờ CÓ múi giờ rõ ràng: giữ nguyên, không bị cộng thêm', () => {
    it.each([
      ['2024-10-15T09:43:27Z', '15/10/2024 16:43:27'],
      ['2024-10-15T09:43:27+07:00', '15/10/2024 09:43:27'],
      ['2024-10-15T09:43:27-05:00', '15/10/2024 21:43:27'],
    ])('%s -> %s (giờ VN)', (raw, expected) => {
      // dù có khai báo sourceTimeZone khác, giá trị đã mang múi giờ thì không bị đổi
      expect(displayIn(run(raw, 'datetime', undefined, 'America/New_York'), HCM)).toBe(expected);
      expect(displayIn(run(raw, 'datetime'), HCM)).toBe(expected);
    });
  });

  describe('chỉ có ngày (type date)', () => {
    it('DD/MM/YYYY, mặc định UTC hoặc Asia/Ho_Chi_Minh: hiển thị đúng ngày, không lệch', () => {
      expect(displayIn(run('13/12/2025', 'date', 'DD/MM/YYYY'), HCM, false)).toBe('13/12/2025');
      expect(displayIn(run('13/12/2025', 'date', 'DD/MM/YYYY', HCM), HCM, false)).toBe('13/12/2025');
    });

    it('múi giờ nguồn nằm phía TÂY Việt Nam (America/Los_Angeles): vẫn đúng ngày', () => {
      expect(displayIn(run('13/12/2025', 'date', 'DD/MM/YYYY', 'America/Los_Angeles'), HCM, false)).toBe('13/12/2025');
    });
  });

  describe('giờ mùa hè (DST) của múi giờ nguồn', () => {
    const NY = 'America/New_York';
    it('mùa hè (EDT, -04:00) và mùa đông (EST, -05:00) cho ra UTC khác nhau đúng', () => {
      expect(run('2026-07-01T12:00:00', 'datetime', undefined, NY)).toBe('2026-07-01T16:00:00.000Z');
      expect(run('2026-01-01T12:00:00', 'datetime', undefined, NY)).toBe('2026-01-01T17:00:00.000Z');
    });
    it('giờ không tồn tại (nhảy giờ 08/03/2026 02:30) và giờ lặp (01/11/2026 01:30) vẫn ra một mốc hợp lệ, không NaN/ngoại lệ', () => {
      for (const raw of ['2026-03-08T02:30:00', '2026-11-01T01:30:00']) {
        const iso = run(raw, 'datetime', undefined, NY);
        expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
        expect(iso).toMatch(/^2026-(03-08|11-01)T\d{2}:30:00\.000Z$/);
      }
    });
  });

  describe('giá trị không phải ngày giờ', () => {
    it('giữ nguyên chuỗi gốc, không ném lỗi', () => {
      expect(run('không rõ', 'datetime', 'DD/MM/YYYY HH:mm:ss', HCM)).toBe('không rõ');
      expect(run('31/02/2026 10:00:00', 'datetime', 'DD/MM/YYYY HH:mm:ss', HCM)).toBe('31/02/2026 10:00:00');
    });
  });
});
