/**
 * Seeds diverse demo rows into app.query_logs (+ demo users `demo-*`) to try
 * out the admin history / stats / insights UI. DEV/TEST ONLY.
 *
 * Usage (from apps/api so workspace deps resolve):
 *   pnpm --filter api exec ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node"}' \
 *     ../../scripts/seed-demo-query-logs.ts [--dry-run] [--clean] [--confirm-write=<dbPort>] \
 *     [--database-url=<url>] [--days=60] [--seed=20261111] [--reset-passwords]
 *
 * Safety: refuses NODE_ENV=production, any DB host other than localhost/127.0.0.1/::1
 * (e.g. docker host `postgres`), and any port other than 55432/55434. Writing
 * (seed or --clean) needs --confirm-write=<port> equal to the DB port.
 * Cleanup removes only: query_logs with user_agent 'demo-seed/%' or owned by a
 * `demo-%` user, then the `demo-%` users themselves. Real data is untouched.
 */
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Client as PgClient } from 'pg';
import { DEMO_USERS, DEMO_UA_PREFIX, DEMO_USER_PREFIX, generateDemoRows, type DemoRow } from './seed-demo-query-logs-data';

// Load deps from apps/api regardless of this script's location.
const req = createRequire(path.resolve(__dirname, '../apps/api/package.json'));
const { Client } = req('pg') as typeof import('pg');
const argon2 = req('argon2') as { hash(p: string, o: { type: number }): Promise<string>; argon2id: number };

const ALLOWED_PORTS = ['55432', '55434'];
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

function guardDb(url: string): URL {
  if (process.env.NODE_ENV === 'production') throw new Error('Refuse: NODE_ENV=production');
  const u = new URL(url);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Refuse: DB host "${host}" is not local (docker/prod?)`);
  if (!ALLOWED_PORTS.includes(u.port)) throw new Error(`Refuse: DB port "${u.port}" not in ${ALLOWED_PORTS.join('/')}`);
  return u;
}

function printStats(rows: DemoRow[]) {
  const by = (f: (r: DemoRow) => string) => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(f(r), (m.get(f(r)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const vnHour = (r: DemoRow) => new Date(r.createdAt.getTime() + 7 * 3600e3).getUTCHours();
  console.log(`rows: ${rows.length}  (${rows[0]?.createdAt.toISOString()} -> ${rows[rows.length - 1]?.createdAt.toISOString()})`);
  console.log('status:', JSON.stringify(by((r) => `${r.status}/${r.statusCode ?? 'null'}`)));
  console.log('user:', JSON.stringify(by((r) => r.username)));
  console.log('datasource:', JSON.stringify(by((r) => r.code)));
  console.log('ip distinct:', new Set(rows.map((r) => r.ip)).size, ' off-hours(<8|>=18 VN):', rows.filter((r) => vnHour(r) < 8 || vnHour(r) >= 18).length);
  console.log('durationMs null:', rows.filter((r) => r.durationMs == null).length, ' recordCount null (success):', rows.filter((r) => r.status === 'success' && r.recordCount == null).length);
  const top = by((r) => `${r.username} ${r.createdAt.toISOString().slice(0, 10)}`)[0];
  console.log('busiest user-day:', top.join(' = '));
  const hot = new Set(rows.filter((r) => r.params.citizenId === '001099001234' || r.params.cccd === '001099001234').map((r) => r.username));
  console.log('users who looked up 001099001234:', [...hot].join(', '));
}

async function clean(c: PgClient): Promise<void> {
  const like = `${DEMO_USER_PREFIX}%`;
  const l1 = await c.query(
    `DELETE FROM app.query_logs WHERE user_agent LIKE $1 OR username_snapshot LIKE $2 OR user_id IN (SELECT id FROM app.users WHERE username LIKE $2)`,
    [`${DEMO_UA_PREFIX}%`, like],
  );
  const ids = `(SELECT id FROM app.users WHERE username LIKE $1)`;
  await c.query(`DELETE FROM app.refresh_tokens WHERE user_id IN ${ids}`, [like]);
  await c.query(`DELETE FROM app.user_roles WHERE user_id IN ${ids}`, [like]);
  await c.query(`DELETE FROM app.audit_logs WHERE actor_user_id IN ${ids}`, [like]);
  const u = await c.query(`DELETE FROM app.users WHERE username LIKE $1`, [like]);
  console.log(`cleaned: ${l1.rowCount} query_logs, ${u.rowCount} demo users`);
}

async function ensureUsers(c: PgClient): Promise<Map<string, string>> {
  const role = await c.query(`SELECT id FROM app.roles WHERE code = 'OPERATOR'`);
  if (!role.rowCount) throw new Error('OPERATOR role missing - run db:seed first');
  const ids = new Map<string, string>();
  for (const username of DEMO_USERS) {
    const ex = await c.query(`SELECT id FROM app.users WHERE username = $1`, [username]);
    let id: string;
    if (ex.rowCount && !flag('reset-passwords')) {
      id = ex.rows[0].id;
      console.log(`user ${username}: exists, password unchanged`);
    } else {
      const pw = randomBytes(15).toString('base64url').slice(0, 20);
      const hash = await argon2.hash(pw, { type: argon2.argon2id });
      const r = await c.query(
        `INSERT INTO app.users (username, full_name, password_hash, must_change_password, updated_at)
         VALUES ($1, $2, $3, false, now())
         ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active', failed_login_count = 0, locked_until = NULL, updated_at = now()
         RETURNING id`,
        [username, `Demo ${username.slice(5)}`, hash],
      );
      id = r.rows[0].id;
      console.log(`user ${username}: tempPassword: ${pw}`);
    }
    await c.query(`INSERT INTO app.user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, role.rows[0].id]);
    ids.set(username, id);
  }
  return ids;
}

async function insertRows(c: PgClient, rows: DemoRow[]): Promise<void> {
  const cols = 15;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const vals: unknown[] = [];
    const ph = chunk.map((r, j) => {
      vals.push(r.userId, r.username, r.code, JSON.stringify(r.params), r.summary, r.status, r.statusCode, r.errorCode, r.errorMessage, r.recordCount, r.upstreamRequestId, r.durationMs, r.ip, r.userAgent, r.createdAt);
      const b = j * cols;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4}::jsonb,$${b + 5},$${b + 6}::app."QueryStatus",$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13}::inet,$${b + 14},$${b + 15})`;
    });
    await c.query(
      `INSERT INTO app.query_logs (user_id, username_snapshot, datasource_code, query_params, query_summary, status, status_code, error_code, error_message, record_count, upstream_request_id, duration_ms, ip, user_agent, created_at) VALUES ${ph.join(',')}`,
      vals,
    );
  }
}

async function main() {
  const days = Number(opt('days') ?? 60);
  const seed = Number(opt('seed') ?? 20261111);
  if (flag('dry-run')) {
    // No DB connection at all: preview with placeholder user ids.
    printStats(generateDemoRows(seed, days, new Map(DEMO_USERS.map((u) => [u, 'dry-run']))));
    console.log('[dry-run] nothing written');
    return;
  }
  const url = opt('database-url') ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL (or --database-url) required');
  const u = guardDb(url);
  if (opt('confirm-write') !== u.port) throw new Error(`Writing needs --confirm-write=${u.port}`);
  const c = new Client({ connectionString: url.split('?')[0] });
  await c.connect();
  try {
    console.log(`target: ${u.hostname}:${u.port}${u.pathname}`);
    await clean(c); // idempotent: re-run replaces previous demo data
    if (flag('clean')) return;
    const rows = generateDemoRows(seed, days, await ensureUsers(c));
    await insertRows(c, rows);
    printStats(rows);
    console.log('inserted', rows.length);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
