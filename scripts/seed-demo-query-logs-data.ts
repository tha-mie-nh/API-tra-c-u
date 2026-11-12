/**
 * Pure (no DB) generator of diverse demo `app.query_logs` rows for the admin
 * drill-down / stats / insights UI. Deterministic for a given seed.
 * Every row carries user_agent `demo-seed/...` so `--clean` can delete exactly
 * what was generated. Consumed by seed-demo-query-logs.ts.
 */
export const DEMO_UA_PREFIX = 'demo-seed/';
export const DEMO_USER_PREFIX = 'demo-';
export const HOT_CCCD = '001099001234'; // real value from mock data, queried by >=4 users
export const SHARED_IP = '10.20.30.40'; // used by 3 accounts
export const DEMO_USERS = ['demo-an', 'demo-binh', 'demo-chi', 'demo-dung', 'demo-em', 'demo-giang', 'demo-hoa'];
export const SPIKE_USER = 'demo-binh';

export interface DemoRow {
  userId: string | null;
  username: string;
  code: string;
  params: Record<string, string>;
  summary: string;
  status: 'success' | 'failed' | 'denied';
  statusCode: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  recordCount: number | null;
  upstreamRequestId: string | null;
  durationMs: number | null;
  ip: string;
  userAgent: string;
  createdAt: Date;
}

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Mobile Safari/604.1',
];
const USER_IPS: Record<string, string[]> = {
  'demo-an': ['10.10.1.11', '10.10.1.12', '172.16.5.20'], // same username, several IPs
  'demo-binh': ['10.10.2.21'],
  'demo-chi': [SHARED_IP, '10.10.3.31'],
  'demo-dung': [SHARED_IP],
  'demo-em': [SHARED_IP, '192.168.50.7'],
  'demo-giang': ['10.10.5.51'],
  'demo-hoa': ['10.10.6.61', '203.0.113.45'],
};
// Real datasource codes from config/config.json -> param builder.
const DATASOURCES = [
  'CITIZEN_BASIC', 'CITIZEN_EXTENDED', 'CITIZEN_RESIDENCE', 'XUAT_NHAP_CANH', 'CCCD_HISTORY',
  'VEHICLE_OWNERSHIP', 'FAMILY_EVENTS', 'IMMIGRATION_HISTORY', 'PASSPORT_INFO', 'DRIVER_LICENSE',
  'FACE_PHOTO', 'BHXH_LOOKUP',
];
const WEIGHT: Record<string, number> = { IMMIGRATION_HISTORY: 4, PASSPORT_INFO: 3, CITIZEN_BASIC: 4, DRIVER_LICENSE: 2, FACE_PHOTO: 2, BHXH_LOOKUP: 2 };

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** VN (UTC+7, no DST) wall-clock -> UTC Date. `day` may overflow, Date.UTC normalises. */
function vn(y: number, m: number, day: number, h: number, mi = 0, s = 0, ms = 0): Date {
  return new Date(Date.UTC(y, m, day, h - 7, mi, s, ms));
}

export function generateDemoRows(seed: number, days: number, userIds: Map<string, string>, now = new Date()): DemoRow[] {
  const rnd = mulberry32(seed);
  const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const vnNow = new Date(now.getTime() + 7 * 3600e3);
  const [Y, M, D] = [vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()];
  const pool = Array.from({ length: 40 }, (_, i) => `0010990${String(10000 + i * 137).padStart(5, '0')}`);
  const dsPool = DATASOURCES.flatMap((c) => Array(WEIGHT[c] ?? 1).fill(c) as string[]);
  const rows: DemoRow[] = [];
  let reqSeq = 0;

  const params = (code: string, cccd: string): Record<string, string> => {
    if (code === 'IMMIGRATION_HISTORY') return { passportNumber: `B${cccd.slice(3)}` };
    if (code === 'BHXH_LOOKUP') return { cccd };
    if (code === 'DRIVER_LICENSE') return { fullName: 'Nguyen Van A', licenseNumber: `7900${cccd.slice(6)}`, citizenId: cccd, dob: '1990-05-12', licenseClass: 'B2' };
    return { citizenId: cccd };
  };
  const duration = (): number | null => {
    const r = rnd();
    if (r < 0.05) return null;
    if (r < 0.9) return Math.round(5 + Math.pow(rnd(), 3) * 800);
    if (r < 0.98) return int(800, 5000);
    return int(5000, 30000);
  };
  const make = (user: string, at: Date, code: string, cccd: string, forceOk = false): DemoRow => {
    const p = params(code, cccd);
    const r = forceOk ? 0 : rnd();
    const base = {
      userId: userIds.get(user) ?? null, username: user, code, params: p,
      summary: `Tra cứu ${code} theo ${Object.keys(p)[0]}=${Object.values(p)[0]}`,
      ip: pick(USER_IPS[user] ?? ['10.10.9.9']), userAgent: `${DEMO_UA_PREFIX}${pick(UAS)}`, createdAt: at,
      upstreamRequestId: null as string | null, errorCode: null as string | null, errorMessage: null as string | null,
    };
    const rid = `demo-${seed}-${(reqSeq++).toString(36)}`;
    if (r < 0.06) return { ...base, status: 'denied', statusCode: 403, recordCount: null, durationMs: int(2, 30), errorMessage: 'Không có quyền truy cập nguồn dữ liệu' };
    if (r < 0.18) {
      const f = pick([[422, 'VALIDATION_FAILED', 'Tham số không hợp lệ', false], [502, 'UPSTREAM_BAD_GATEWAY', 'Nguồn dữ liệu trả lỗi', true], [504, 'UPSTREAM_TIMEOUT', 'Nguồn dữ liệu phản hồi quá hạn', true]] as const);
      return { ...base, status: 'failed', statusCode: f[0], errorCode: f[1], errorMessage: f[2], recordCount: null, upstreamRequestId: f[3] ? rid : null, durationMs: f[0] === 504 ? int(15000, 30000) : duration() };
    }
    const q = rnd();
    const legacy = rnd() < 0.03; // old rows: no status_code
    return { ...base, status: 'success', statusCode: legacy ? null : 200, upstreamRequestId: rid, durationMs: duration(), recordCount: q < 0.7 ? int(1, 12) : q < 0.95 ? 0 : null };
  };
  const offHours = () => (rnd() < 0.5 ? int(19, 23) : int(0, 5));

  for (let back = days; back >= 0; back--) {
    const dayStart = vn(Y, M, D - back, 0);
    const dow = new Date(dayStart.getTime() + 7 * 3600e3).getUTCDay(); // VN weekday
    const weekend = dow === 0 || dow === 6;
    for (const user of DEMO_USERS) {
      let n = weekend ? (rnd() < 0.25 ? int(1, 3) : 0) : int(3, 7);
      if (user === SPIKE_USER && back === 3) n = 40;
      if (rnd() < 0.1 && user !== SPIKE_USER) n = 0; // some users inactive that day
      for (let i = 0; i < n; i++) {
        const wr = rnd();
        const h = weekend ? int(8, 17) : wr < 0.82 ? int(8, 17) : wr < 0.92 ? int(18, 21) : offHours();
        const at = vn(Y, M, D - back, h, int(0, 59), int(0, 59), int(0, 999));
        if (at > now) continue;
        rows.push(make(user, at, pick(dsPool), pick(pool)));
      }
    }
  }
  // One CCCD looked up by >=4 distinct users on different datasources (last ~2 weeks).
  ['demo-an', 'demo-chi', 'demo-giang', 'demo-hoa', 'demo-dung'].forEach((u, i) => {
    const code = ['CITIZEN_BASIC', 'PASSPORT_INFO', 'IMMIGRATION_HISTORY', 'FACE_PHOTO', 'BHXH_LOOKUP'][i];
    rows.push(make(u, vn(Y, M, D - (10 - i * 2), 9 + i, int(0, 59), int(0, 59)), code, HOT_CCCD, true));
  });
  // Day-boundary rows (VN) + CSV-injection / deleted-user rows (user_id NULL).
  const edge = (h: number, mi: number, s: number, ms: number, user: string, back: number) =>
    rows.push({ ...make(user, vn(Y, M, D - back, h, mi, s, ms), 'CITIZEN_BASIC', pool[1], true), userId: null });
  edge(23, 59, 59, 999, 'demo-former', 5);
  edge(0, 0, 0, 0, 'demo-former', 4);
  edge(10, 0, 0, 0, '=demo-formula', 6);
  edge(11, 0, 0, 0, '+demo-plus', 6);
  edge(12, 0, 0, 0, '@demo-at', 6);
  rows[rows.length - 5].summary = '=HYPERLINK("http://evil.example","x")';
  rows[rows.length - 3].summary = '+1+1';
  rows[rows.length - 2].summary = '@SUM(1,1)';
  return rows.filter((r) => r.createdAt <= now).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
