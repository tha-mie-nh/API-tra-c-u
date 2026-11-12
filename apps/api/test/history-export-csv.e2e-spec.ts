import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { HistoryExportCsvService } from '../src/history/history-export-csv.service';
import { auth, bootApp, cleanupUsers, createRoleUser, toQueryLogData, type E2eUser } from './fixtures/query-log-e2e-fixtures';

type Made = E2eUser & { roleId: string };

/** Minimal RFC4180 parser (quoted cells, doubled quotes, newlines in cells). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += ch;
  }
  return rows;
}

describe('History CSV export (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const sfx = Date.now();
  const C = `E2E_CSV_${sfx}`;
  const snapUser = `csvu_${sfx}`;
  const REAL_CCCD = '001099123456';
  let full: Made; // view_all + view_sensitive + export
  let masked: Made; // view_all + export
  let ownExp: Made; // view_own + export
  let viewOnly: Made; // view_all only
  const Q = (extra = '') => `datasourceCode=${C}&from=2021-06-01&to=2021-06-01${extra}`;
  const SENS_Q = `username=${snapUser}&from=2021-06-01&to=2021-06-01`;
  const exp = (q: string, t: string) =>
    request(app.getHttpServer()).get(`/api/v1/history/export.csv?${q}`).set(auth(t)).buffer(true).parse((res, cb) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (d += c));
      res.on('end', () => cb(null, d));
    });

  beforeAll(async () => {
    ({ app, prisma } = await bootApp());
    full = await createRoleUser(app, prisma, `CSV_FULL_${sfx}`, ['history:view_all', 'history:view_sensitive', 'history:export']);
    masked = await createRoleUser(app, prisma, `CSV_MASK_${sfx}`, ['history:view_all', 'history:export']);
    ownExp = await createRoleUser(app, prisma, `CSV_OWN_${sfx}`, ['history:view_own', 'history:export']);
    viewOnly = await createRoleUser(app, prisma, `CSV_VIEW_${sfx}`, ['history:view_all']);

    const at = (m: number) => `2021-06-01T03:${String(m).padStart(2, '0')}:00Z`;
    const rows = [
      { code: C, at: at(1), username: `=cmd|' /C calc'!A0`, summary: '+1+1', status: 'success' as const, recordCount: 1, statusCode: 200 },
      { code: C, at: at(2), username: 'normal', status: 'failed' as const, statusCode: 502, errorCode: 'UPSTREAM_ERROR', errorMessage: '@SUM(A1)' },
      { code: C, at: at(3), username: 'normal', status: 'failed' as const, statusCode: 502, errorCode: 'UPSTREAM_ERROR', errorMessage: '-2+3' },
      { code: C, at: at(4), username: 'say "hi", ok', status: 'failed' as const, statusCode: 500, errorMessage: 'line1\nline2 "q"' },
      { code: C, at: at(5), username: 'own', userId: ownExp.id, status: 'success' as const, recordCount: 2, statusCode: 200 },
      { code: 'PASSPORT_INFO', at: at(6), username: snapUser, params: { citizenId: REAL_CCCD }, summary: `CCCD=${REAL_CCCD}`, status: 'success' as const, recordCount: 1, statusCode: 200 },
    ];
    for (const r of rows) await prisma.queryLog.create({ data: { ...toQueryLogData(r), ip: undefined } });
    await prisma.$executeRawUnsafe(`UPDATE app.query_logs SET ip = '10.1.1.1'::inet WHERE datasource_code = '${C}'`);
  });

  afterAll(async () => {
    await prisma.queryLog.deleteMany({ where: { OR: [{ datasourceCode: C }, { usernameSnapshot: snapUser }] } });
    await cleanupUsers(prisma, [full, masked, ownExp, viewOnly]);
    await app.close();
  });

  it('403 without history:export (even with view_all), 401 anonymous, 422 bad filter', async () => {
    expect((await exp(Q(), viewOnly.token)).status).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/v1/history/export.csv')).status).toBe(401);
    expect((await exp('status=nope', full.token)).status).toBe(422);
  });

  it('headers, BOM, CRLF, header row, count = list total, newest first', async () => {
    const res = await exp(Q(), full.token);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="lich-su-tra-cuu-\d{8}-\d{4}\.csv"/);
    expect(res.headers['x-export-total']).toBe('5');
    expect(res.headers['x-export-truncated']).toBe('false');
    const text = res.body as string;
    expect(text.startsWith('﻿"ID"')).toBe(true);
    const rows = parseCsv(text.slice(1));
    expect(rows).toHaveLength(6);
    expect(rows[0]![1]).toBe('Thời điểm (giờ VN)');
    const list = await request(app.getHttpServer()).get(`/api/v1/history?${Q()}&pageSize=100`).set(auth(full.token));
    expect(rows.slice(1).map((r) => r[0])).toEqual(list.body.items.map((i: { id: string }) => i.id));
    expect(rows[1]![1]).toBe('2021-06-01T10:05:00.000+07:00'); // VN time
    expect(rows[1]![13]).toBe('10.1.1.1');
  });

  it('CSV injection: formula cells get a leading apostrophe; quotes/newlines round-trip', async () => {
    const text = (await exp(Q(), full.token)).body as string;
    expect(text).toContain(`"'=cmd|' /C calc'!A0"`);
    expect(text).toContain(`"'+1+1"`);
    expect(text).toContain(`"'@SUM(A1)"`);
    expect(text).toContain(`"'-2+3"`);
    const rows = parseCsv(text.slice(1));
    expect(rows.some((r) => r[2] === 'say "hi", ok' && r[9] === 'line1\nline2 "q"')).toBe(true);
    // no cell may start with a bare formula char
    for (const r of rows) for (const c of r) expect(c).not.toMatch(/^[=+\-@\t\r]/);
  });

  it('sensitive masking follows history:view_sensitive', async () => {
    const m = (await exp(SENS_Q, masked.token)).body as string;
    expect(m).not.toContain(REAL_CCCD);
    expect(m).toContain('********3456');
    const f = (await exp(SENS_Q, full.token)).body as string;
    expect(f).toContain(REAL_CCCD);
  });

  it('view_own + export: only own rows regardless of query string', async () => {
    const res = await exp(`${Q()}&userId=${full.id}&username=normal`, ownExp.token);
    expect(res.status).toBe(200);
    const rows = parseCsv((res.body as string).slice(1));
    expect(rows).toHaveLength(2);
    expect(rows[1]![3]).toBe(ownExp.id);
    expect(res.headers['x-export-total']).toBe('1');
  });

  it('filters apply to the export (status + errorCode)', async () => {
    const res = await exp(Q('&status=failed&errorCode=UPSTREAM_ERROR'), full.token);
    expect(res.headers['x-export-total']).toBe('2');
    expect(parseCsv((res.body as string).slice(1))).toHaveLength(3);
  });

  it('audit export_csv: filters + counts, NO response content / CCCD', async () => {
    const q = SENS_Q;
    await exp(q, full.token);
    let row = null;
    for (let i = 0; i < 20 && !row; i++) {
      row = await prisma.auditLog.findFirst({ where: { action: 'query_log.export_csv', actorUserId: full.id }, orderBy: { createdAt: 'desc' } });
      if (!row) await new Promise((r) => setTimeout(r, 100));
    }
    expect(row).not.toBeNull();
    const after = row!.after as { filters: Record<string, string>; matched: number; exported: number; truncated: boolean; maxRows: number };
    expect(after.filters).toMatchObject({ username: snapUser, from: '2021-06-01', to: '2021-06-01' });
    expect(after).toMatchObject({ matched: 1, exported: 1, truncated: false, maxRows: 50000 });
    const json = JSON.stringify(row!.after);
    expect(json).not.toContain(REAL_CCCD);
    expect(json).not.toContain('Thời điểm');
    expect(row!.before).toBeNull();
  });

  it('truncation at maxRows (service-level, small injected limit)', async () => {
    const svc = app.get(HistoryExportCsvService);
    const out = await svc.prepare({ id: full.id, username: full.username }, new Set(['history:view_all', 'history:export']), { datasourceCode: C }, 2);
    expect(out).toMatchObject({ matched: 5, exported: 2, truncated: true, maxRows: 2 });
    let text = '';
    for await (const chunk of out.stream) text += chunk;
    expect(parseCsv(text.slice(1))).toHaveLength(3); // header + 2
  });

  it('keyset paging crosses batch boundary without loss/dupes (2500 rows incl. identical timestamps)', async () => {
    const code = `${C}_BIG`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO app.query_logs (username_snapshot, datasource_code, query_params, status, created_at)
       SELECT 'big', '${code}', '{}'::jsonb, 'success', '2021-06-01T03:00:00Z'::timestamptz + (g / 3) * interval '1 microsecond' FROM generate_series(1, 2500) g`,
    );
    try {
      const res = await exp(`datasourceCode=${code}&from=2021-06-01&to=2021-06-01`, full.token);
      const rows = parseCsv((res.body as string).slice(1)).slice(1);
      expect(rows).toHaveLength(2500);
      expect(new Set(rows.map((r) => r[0])).size).toBe(2500);
    } finally {
      await prisma.queryLog.deleteMany({ where: { datasourceCode: code } });
    }
  });
});
