/**
 * Fires real lookups through the running API (login + POST /api/v1/query/:code
 * with {"params":{...}}) so the genuine query-log write path is exercised
 * (valid 200, invalid 422, datasource without permission 403). Respects the
 * 30/min/user limit: each user is sequential with a 2.5 s gap (<=24/min);
 * users run in parallel. On HTTP 429 it waits and retries once.
 *
 * Usage (needs Node 18+ fetch; api on :3000, mock upstream on :4100):
 *   LIVE_USERS='demo-an:PASS1,demo-binh:PASS2,admin:ADMINPASS' \
 *   pnpm --filter api exec ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node"}' \
 *     ../../scripts/generate-live-queries-through-api.ts [--base=http://localhost:3000] [--per-user=20] [--dry-run]
 * Passwords come from env only and are never printed.
 */
const args = process.argv.slice(2);
const opt = (n: string, d: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const base = opt('base', 'http://localhost:3000').replace(/\/$/, '');
const perUser = Number(opt('per-user', '20'));
const GAP_MS = 2500;

interface Call { code: string; params: Record<string, string>; kind: 'valid' | 'invalid' }
const CCCDS = ['001099001234', '001099009999', '001099010137'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildCall(i: number): Call {
  const cccd = CCCDS[i % CCCDS.length];
  const m = i % 10;
  if (m === 8) return { code: 'CITIZEN_EXTENDED', params: { citizenId: '123' }, kind: 'invalid' }; // 422
  const valid: Call[] = [
    { code: 'IMMIGRATION_HISTORY', params: { passportNumber: 'B1234567' }, kind: 'valid' },
    { code: 'PASSPORT_INFO', params: { citizenId: cccd }, kind: 'valid' },
    { code: 'FACE_PHOTO', params: { citizenId: cccd }, kind: 'valid' },
    { code: 'BHXH_LOOKUP', params: { cccd }, kind: 'valid' },
    { code: 'CITIZEN_BASIC', params: { citizenId: cccd }, kind: 'valid' },
    { code: 'DRIVER_LICENSE', params: { fullName: 'Nguyen Van A', licenseNumber: '790012345', citizenId: cccd, dob: '1990-05-12', licenseClass: 'B2' }, kind: 'valid' },
  ];
  return valid[i % valid.length]; // datasources the role lacks permission for end up 403 naturally
}

async function post(url: string, body: unknown, token?: string): Promise<{ status: number; json: any }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'live-demo-queries/1.0', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function runUser(username: string, password: string, offset: number): Promise<Record<string, number>> {
  const tally: Record<string, number> = {};
  const login = await post(`${base}/api/v1/auth/login`, { username, password });
  if (login.status !== 200 && login.status !== 201) {
    console.error(`[${username}] login failed: HTTP ${login.status}`);
    return { login_failed: 1 };
  }
  const token = login.json.accessToken as string;
  for (let i = 0; i < perUser; i++) {
    const call = buildCall(i + offset);
    let r = await post(`${base}/api/v1/query/${call.code}`, { params: call.params }, token);
    if (r.status === 429) { await sleep(15000); r = await post(`${base}/api/v1/query/${call.code}`, { params: call.params }, token); }
    tally[String(r.status)] = (tally[String(r.status)] ?? 0) + 1;
    await sleep(GAP_MS);
  }
  return tally;
}

async function main() {
  const users = (process.env.LIVE_USERS ?? '').split(',').filter(Boolean).map((p) => {
    const k = p.indexOf(':');
    return [p.slice(0, k), p.slice(k + 1)] as const;
  });
  if (!users.length) throw new Error("Set LIVE_USERS='user:password,user2:password2'");
  const mins = Math.ceil((perUser * GAP_MS) / 60000);
  console.log(`users=${users.map((u) => u[0]).join(',')} perUser=${perUser} base=${base} ~${mins} min (<=24 req/min/user)`);
  if (args.includes('--dry-run')) {
    console.log('[dry-run] sample plan:', JSON.stringify(Array.from({ length: Math.min(perUser, 10) }, (_, i) => buildCall(i).code + (buildCall(i).kind === 'invalid' ? '(422)' : ''))));
    return;
  }
  const results = await Promise.all(users.map(([u, p], idx) => runUser(u, p, idx * 3)));
  users.forEach(([u], i) => console.log(`${u}: ${JSON.stringify(results[i])}`));
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
