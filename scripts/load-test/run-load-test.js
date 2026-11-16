#!/usr/bin/env node
/**
 * Load / behaviour test for the lookup API, driven like real users: log in, think, query, repeat.
 * Everything goes through the public entry point (nginx) so it measures what users experience.
 *
 *   node scripts/load-test/run-load-test.js --base http://localhost:8081 --admin-password '...' \
 *        --pg-container app-tra-cuu-du-lieu-test-postgres-1 --out results.json [--only A,B,...]
 *
 * Needs datasources LT_FAST / LT_SLOW / LT_FLAKY / LT_TIMEOUT (see docs/ket-qua-kiem-thu-tai-api-v13.md for the
 * config and the mock-echo upstreams behind them). Users are created through the admin API; the "must change
 * password" flag is cleared with psql inside the postgres container so virtual users can log in directly.
 *
 * Scenarios: login (login rush), A baseline, B office day, C slow upstream, D timeouts, E flaky upstream,
 * F one spammer next to normal users, G simultaneous burst, H soak, I saturation (find the throughput ceiling).
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { setTimeout } = require('node:timers');
/* global fetch -- Node 22 built-in */

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []),
);
const BASE = args.base ?? 'http://localhost:8081';
const ADMIN_PASSWORD = args['admin-password'];
const PG = args['pg-container'];
const ONLY = args.only ? new Set(args.only.split(',')) : null;
const USERS = Number(args.users ?? 60);
const SOAK_MS = Number(args['soak-seconds'] ?? 120) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

async function call(method, path, { token, body, requestId } = {}) {
  const started = performance.now();
  let status = 0;
  let json = null;
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch (err) {
    status = -1; // network error / reset
    json = { error: { code: `NETWORK_${err.cause?.code ?? err.name}` } };
  }
  return { ms: performance.now() - started, status, json };
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/** Aggregates samples [{ms,status,code}] into the numbers we report. */
function summarize(name, samples, wallMs, extra = {}) {
  const lat = samples.map((s) => s.ms).sort((a, b) => a - b);
  const okLat = samples.filter((s) => s.status === 200).map((s) => s.ms).sort((a, b) => a - b);
  const byStatus = {};
  const byCode = {};
  for (const s of samples) {
    byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    if (s.status !== 200) byCode[s.code ?? s.status] = (byCode[s.code ?? s.status] ?? 0) + 1;
  }
  const r = (n) => Math.round(n);
  return {
    name,
    requests: samples.length,
    ok: byStatus[200] ?? 0,
    okPct: samples.length ? Math.round(((byStatus[200] ?? 0) / samples.length) * 1000) / 10 : 0,
    byStatus,
    byCode,
    wallSeconds: Math.round(wallMs / 100) / 10,
    rps: Math.round((samples.length / (wallMs / 1000)) * 10) / 10,
    latencyMs: { p50: r(pct(lat, 50)), p90: r(pct(lat, 90)), p95: r(pct(lat, 95)), p99: r(pct(lat, 99)), max: r(lat.at(-1) ?? 0) },
    okLatencyMs: { p50: r(pct(okLat, 50)), p95: r(pct(okLat, 95)), p99: r(pct(okLat, 99)) },
    ...extra,
  };
}

/** Pings /health every 500 ms while a scenario runs: proves the API stays responsive under load. */
function startHealthProbe() {
  const samples = [];
  let stop = false;
  const loop = (async () => {
    while (!stop) {
      const r = await call('GET', '/api/v1/health');
      samples.push(r.status === 200 ? r.ms : Infinity);
      await sleep(500);
    }
  })();
  return async () => {
    stop = true;
    await loop;
    const ok = samples.filter(Number.isFinite).sort((a, b) => a - b);
    return { probes: samples.length, failed: samples.length - ok.length, p50: Math.round(pct(ok, 50)), p95: Math.round(pct(ok, 95)), max: Math.round(ok.at(-1) ?? 0) };
  };
}

function dockerStats(names) {
  try {
    const out = execFileSync('docker', ['stats', '--no-stream', '--format', '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}', ...names], { encoding: 'utf8' });
    return Object.fromEntries(out.trim().split('\n').map((l) => { const [n, cpu, mem] = l.split('\t'); return [n, `${cpu} / ${mem}`]; }));
  } catch {
    return {};
  }
}

async function setupUsers() {
  const adminLogin = await call('POST', '/api/v1/auth/login', { body: { username: 'admin', password: ADMIN_PASSWORD } });
  if (adminLogin.status !== 200) throw new Error(`admin login failed: ${adminLogin.status} ${JSON.stringify(adminLogin.json)}`);
  const token = adminLogin.json.accessToken;
  const roles = await call('GET', '/api/v1/admin/roles', { token });
  const adminRole = (roles.json.items ?? roles.json).find((r) => r.name === 'ADMIN' || r.code === 'ADMIN');
  const users = [];
  const prefix = `lt${Date.now().toString(36)}`;
  for (let i = 0; i < USERS + 12; i++) {
    const username = `${prefix}_${i}`;
    const created = await call('POST', '/api/v1/admin/users', { token, body: { username, fullName: `Load Test ${i}`, roleIds: adminRole ? [adminRole.id] : [] } });
    if (created.status !== 201 && created.status !== 200) throw new Error(`create user failed: ${created.status} ${JSON.stringify(created.json)}`);
    users.push({ username, password: created.json.tempPassword ?? created.json.temporaryPassword });
  }
  execFileSync('docker', ['exec', PG, 'psql', '-U', 'app_user', '-d', 'app_tra_cuu', '-c', `update app.users set must_change_password=false where username like '${prefix}_%';`], { encoding: 'utf8' });
  return users;
}

async function login(u) {
  const r = await call('POST', '/api/v1/auth/login', { body: { username: u.username, password: u.password } });
  return { ...r, token: r.json?.accessToken };
}

let seq = 0;
async function query(u, code, tag) {
  const r = await call('POST', `/api/v1/query/${code}`, { token: u.token, requestId: `lt-${tag}-${++seq}`, body: { params: { soHC: `B${seq}` } } });
  return { ms: r.ms, status: r.status, code: r.json?.error?.code, ds: code };
}

/** Closed loop: each virtual user queries, waits `think()` ms, repeats until `durationMs` (or `maxPerUser`). */
async function closedLoop(users, { durationMs, think, pick, maxPerUser = Infinity, tag }) {
  const samples = [];
  const end = performance.now() + durationMs;
  await Promise.all(users.map(async (u, i) => {
    await sleep(rand(0, 1000)); // users do not start in the same millisecond
    for (let n = 0; n < maxPerUser && performance.now() < end; n++) {
      samples.push(await query(u, pick(), `${tag}${i}`));
      await sleep(think());
    }
  }));
  return samples;
}

async function scenario(name, fn) {
  if (ONLY && !ONLY.has(name[0])) return null;
  console.log(`\n=== ${name}`);
  const stopProbe = startHealthProbe();
  const started = performance.now();
  const samples = await fn();
  const wall = performance.now() - started;
  const health = await stopProbe();
  const sum = summarize(name, samples, wall, { health });
  console.log(JSON.stringify(sum));
  return sum;
}

(async () => {
  if (!ADMIN_PASSWORD || !PG) throw new Error('--admin-password and --pg-container are required');
  const results = { startedAt: new Date().toISOString(), base: BASE, users: USERS, scenarios: [] };
  const push = (r) => r && results.scenarios.push(r);
  const containers = args.containers ? args.containers.split(',') : [];
  results.dockerStatsBefore = dockerStats(containers);

  // --load-session reuses users + tokens from an earlier --save-session run (login first with relaxed limits,
  // then restart the API with the limits under test; tokens live 15 min, so keep the second run short).
  const users = args['load-session'] ? JSON.parse(fs.readFileSync(args['load-session'], 'utf8')) : await setupUsers();
  console.log(`${args['load-session'] ? 'loaded' : 'created'} ${users.length} users`);

  // --- login rush: everyone logs in within a second (typical start of a work day, one office = one IP)
  const rush = args['load-session'] ? null : await scenario('login: rush of simultaneous logins', async () => {
    const out = await Promise.all(users.slice(0, USERS).map(async (u) => { const r = await login(u); u.token = r.token; return { ms: r.ms, status: r.status, code: r.json?.error?.code }; }));
    return out;
  });
  push(rush);
  // Users that were throttled during the rush log in again once the window passes (or the limit is raised by the operator).
  for (const u of users) if (!u.token) { await sleep(150); u.token = (await login(u)).token; }
  const ready = users.filter((u) => u.token);
  results.loggedInUsers = ready.length;
  if (args['save-session']) fs.writeFileSync(args['save-session'], JSON.stringify(users));
  if (args['prepare-only']) {
    if (args.out) fs.writeFileSync(args.out, JSON.stringify(results, null, 2));
    console.log(`prepared ${ready.length}/${users.length} logged-in users`);
    return;
  }
  console.log(`logged in: ${ready.length}/${users.length}`);
  const pool = ready.slice(0, USERS);
  const spammer = ready[USERS] ?? ready[0];
  const fast = () => 'LT_FAST';

  push(await scenario('A: baseline, 1 user, 50 sequential fast queries', () => closedLoop(ready.slice(0, 1), { durationMs: 60000, think: () => 0, pick: fast, maxPerUser: 50, tag: 'A' })));

  push(await scenario(`B: office day, ${USERS} users, think 2-6 s, mix 70% fast / 20% slow / 10% flaky (90 s)`, () => closedLoop(pool, {
    durationMs: 90000, think: () => rand(2000, 6000), tag: 'B',
    pick: () => { const x = Math.random(); return x < 0.7 ? 'LT_FAST' : x < 0.9 ? 'LT_SLOW' : 'LT_FLAKY'; },
  })));

  push(await scenario('C: slow upstream (about 2-3 s), 20 users back to back (40 s)', () => closedLoop(pool.slice(0, 20), { durationMs: 40000, think: () => 0, pick: () => 'LT_SLOW', tag: 'C' })));

  push(await scenario('D: upstream never answers (timeout 3 s), 10 users x 3 requests', () => closedLoop(pool.slice(0, 10), { durationMs: 60000, think: () => 500, pick: () => 'LT_TIMEOUT', maxPerUser: 3, tag: 'D' })));

  push(await scenario('E: flaky upstream (30% of calls fail), 20 users x 20 requests', () => closedLoop(pool.slice(0, 20), { durationMs: 90000, think: () => rand(200, 800), pick: () => 'LT_FLAKY', maxPerUser: 20, tag: 'E' })));

  push(await scenario('F: one user spams 200 requests at once while 10 others work normally', async () => {
    const normal = closedLoop(ready.slice(USERS + 1, USERS + 11), { durationMs: 30000, think: () => rand(1500, 3000), pick: fast, tag: 'Fn' });
    const spam = (async () => { const out = []; const lanes = 20; await Promise.all(Array.from({ length: lanes }, async () => { for (let i = 0; i < 10; i++) out.push(await query(spammer, 'LT_FAST', 'Fspam')); })); return out; })();
    const [n, s] = await Promise.all([normal, spam]);
    results.F_detail = { spamRequests: s.length, spamOk: s.filter((x) => x.status === 200).length, spamThrottled: s.filter((x) => x.status === 429).length, normalRequests: n.length, normalOk: n.filter((x) => x.status === 200).length, normalFailed: n.filter((x) => x.status !== 200).length };
    return [...n, ...s];
  }));

  push(await scenario(`G: burst, ${USERS} users each send 1 query at the same instant`, async () => Promise.all(pool.map((u, i) => query(u, 'LT_FAST', `G${i}`)))));

  push(await scenario(`I: saturation, ${USERS * 3} concurrent lanes (3 per user), no think time, fast upstream, 30 s`, () => closedLoop(pool.flatMap((u) => [u, u, u]), { durationMs: 30000, think: () => 0, pick: fast, tag: 'I' })));

  results.dockerStatsBeforeSoak = dockerStats(containers);
  push(await scenario(`H: soak, ${USERS} users, think 1.5-4 s, ${SOAK_MS / 1000} s`, () => closedLoop(pool, { durationMs: SOAK_MS, think: () => rand(1500, 4000), pick: () => (Math.random() < 0.85 ? 'LT_FAST' : 'LT_SLOW'), tag: 'H' })));
  results.dockerStatsAfter = dockerStats(containers);

  try {
    const q = (sql) => execFileSync('docker', ['exec', PG, 'psql', '-U', 'app_user', '-d', 'app_tra_cuu', '-tA', '-c', sql], { encoding: 'utf8' }).trim();
    results.db = {
      queryLogs: Number(q("select count(*) from app.query_logs where datasource_code like 'LT_%'")),
      payloads: Number(q('select count(*) from app.query_log_payloads')),
      payloadTableSize: q("select pg_size_pretty(pg_total_relation_size('app.query_log_payloads'))"),
      queryLogsTableSize: q("select pg_size_pretty(pg_total_relation_size('app.query_logs'))"),
    };
  } catch (e) { results.db = { error: String(e.message).slice(0, 200) }; }

  if (args.out) fs.writeFileSync(args.out, JSON.stringify(results, null, 2));
  console.log(`\nwritten ${args.out ?? '(no --out)'}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
