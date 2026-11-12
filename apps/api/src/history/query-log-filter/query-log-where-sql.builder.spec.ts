import { buildQueryLogWhereSql, escapeLike } from './query-log-where-sql.builder';
import type { QueryLogFilter } from './query-log-filter-query.schema';

const UUID = '3f2b8c1e-9d4a-4b6e-8a1c-2d3e4f5a6b7c';
const b = (f: QueryLogFilter, scope = {}) => {
  const q = buildQueryLogWhereSql(f, scope);
  return { sql: q.text.replace(/\s+/g, ' ').trim(), values: q.values };
};

describe('buildQueryLogWhereSql', () => {
  it('empty -> TRUE', () => expect(b({})).toEqual({ sql: 'TRUE', values: [] }));

  it('half-open range [from,to)', () => {
    const from = new Date('2026-11-11T17:00:00Z');
    const to = new Date('2026-11-12T17:00:00Z');
    const r = b({ from, to });
    expect(r.sql).toBe('created_at >= $1 AND created_at < $2');
    expect(r.values).toEqual([from, to]);
  });

  it('datasource + multi-value status as text array param', () => {
    const r = b({ datasourceCode: 'CITIZEN', status: ['failed', 'denied'] });
    expect(r.sql).toBe('datasource_code = $1 AND status::text = ANY($2::text[])');
    expect(r.values).toEqual(['CITIZEN', ['failed', 'denied']]);
  });

  it('outcomes are exact complements (answered/empty/gap) and handle NULL record_count', () => {
    expect(b({ outcome: 'answered' }).sql).toBe("(status = 'success' AND record_count > 0)");
    expect(b({ outcome: 'empty' }).sql).toBe("(status = 'success' AND COALESCE(record_count, 0) <= 0)");
    expect(b({ outcome: 'gap' }).sql).toBe("NOT (status = 'success' AND COALESCE(record_count, 0) > 0)");
  });

  it('__null__ (null) vs value for userId / statusCode / errorCode', () => {
    expect(b({ userId: null, statusCode: null, errorCode: null }).sql).toBe(
      'user_id IS NULL AND status_code IS NULL AND error_code IS NULL',
    );
    const r = b({ userId: UUID, statusCode: 504, errorCode: 'UPSTREAM_TIMEOUT' });
    expect(r.sql).toBe('user_id = $1::uuid AND status_code = $2 AND error_code = $3');
    expect(r.values).toEqual([UUID, 504, 'UPSTREAM_TIMEOUT']);
  });

  it('username ILIKE is parametrised and wildcard-escaped', () => {
    const r = b({ username: "50%_a\\b'; DROP TABLE x;--" });
    expect(r.sql).toBe("username_snapshot ILIKE $1 ESCAPE '\\'");
    expect(r.values).toEqual(["%50\\%\\_a\\\\b'; DROP TABLE x;--%"]);
    expect(escapeLike('%_\\')).toBe('\\%\\_\\\\');
  });

  it('ip, duration, hasRecords, upstreamRequestId', () => {
    const r = b({ ip: '10.0.0.1', durationMinMs: 100, durationMaxMs: 900, hasRecords: false, upstreamRequestId: 'req-1' });
    expect(r.sql).toBe(
      'ip = ANY($1::inet[]) AND duration_ms >= $2 AND duration_ms <= $3 AND COALESCE(record_count, 0) <= 0 AND upstream_request_id = $4',
    );
    expect(r.values).toEqual([['10.0.0.1', '::ffff:10.0.0.1'], 100, 900, 'req-1']);
    expect(b({ hasRecords: true }).sql).toBe('COALESCE(record_count, 0) > 0');
  });

  it('offHours uses VN timezone: weekend or outside 07:00-17:59', () => {
    const r = b({ offHours: true });
    expect(r.sql).toContain("created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'");
    expect(r.sql).toContain('IN (6,7)');
    expect(r.sql).toMatch(/NOT BETWEEN \$1 AND \$2/);
    expect(r.values).toEqual([7, 17]);
  });

  it('forced scope AND-ed last and ignores userId/username/ip from filter', () => {
    const r = b({ userId: 'attacker', username: 'admin', ip: '1.1.1.1', status: ['failed'] }, { forcedUserId: UUID });
    expect(r.sql).toBe('status::text = ANY($1::text[]) AND user_id = $2::uuid');
    expect(r.values).toEqual([['failed'], UUID]);
    expect(r.sql).not.toContain('ILIKE');
    expect(r.sql).not.toContain('inet');
  });

  it('no user-supplied string is concatenated into SQL text', () => {
    const evil = "'; DROP TABLE app.query_logs; --";
    const r = b({ datasourceCode: evil, errorCode: evil, upstreamRequestId: evil, username: evil });
    expect(r.sql).not.toContain('DROP');
    expect(r.values.some((v) => String(v).includes('DROP'))).toBe(true);
  });
});
