-- Nạp ~2M dòng query_logs giả để đo EXPLAIN (phase 08). CHỈ chạy trên DB perf riêng (app_tra_cuu_perf).
-- Dùng: psql -h localhost -p 55434 -U app_user -d app_tra_cuu_perf -f scripts/perf-seed-query-logs.sql
\set ON_ERROR_STOP on
SELECT current_database() = 'app_tra_cuu_perf' AS is_perf_db \gset
\if :is_perf_db
\else
  \echo 'ABORT: không phải DB app_tra_cuu_perf'
  \quit
\endif

INSERT INTO app.users (username, full_name, password_hash, updated_at)
SELECT 'perf_user_' || g, 'Perf User ' || g, 'x', now() FROM generate_series(1, 50) g
ON CONFLICT (username) DO NOTHING;

TRUNCATE app.query_logs;

INSERT INTO app.query_logs (user_id, username_snapshot, datasource_code, query_params, query_summary, status, status_code,
  error_code, error_message, record_count, upstream_request_id, duration_ms, ip, user_agent, created_at)
WITH u AS (SELECT id, username, row_number() OVER (ORDER BY username) AS rn FROM app.users WHERE username LIKE 'perf_user_%'),
base AS (
  SELECT g,
    -- user lệch (zipf nhẹ): user nhỏ nhiều hơn
    1 + floor(50 * power(random(), 2))::int AS urn,
    1 + floor(12 * power(random(), 1.5))::int AS dsn,
    random() AS r_status, random() AS r_dur, random() AS r_hour, random() AS r_null,
    now() - (floor(random() * 366) || ' days')::interval AS day_ts
  FROM generate_series(1, 2000000) g
)
SELECT u.id, u.username, 'ds_' || lpad(b.dsn::text, 2, '0'),
  jsonb_build_object('citizenId', lpad((floor(random() * 300000))::text, 12, '0'), 'note', 'perf'),
  NULL,
  CASE WHEN b.r_status < 0.85 THEN 'success' WHEN b.r_status < 0.95 THEN 'failed' ELSE 'denied' END::app."QueryStatus",
  CASE WHEN b.r_status < 0.85 THEN 200 WHEN b.r_status < 0.90 THEN 422 WHEN b.r_status < 0.93 THEN 502 WHEN b.r_status < 0.95 THEN 504 ELSE 403 END,
  CASE WHEN b.r_status < 0.85 THEN NULL WHEN b.r_status < 0.90 THEN 'VALIDATION_ERROR' WHEN b.r_status < 0.93 THEN 'UPSTREAM_BAD_GATEWAY'
       WHEN b.r_status < 0.95 THEN 'UPSTREAM_TIMEOUT' ELSE 'FORBIDDEN' END,
  NULL,
  CASE WHEN b.r_status < 0.85 THEN CASE WHEN b.r_null < 0.10 THEN 0 ELSE 1 + floor(random() * 5)::int END END,
  md5(b.g::text),
  CASE WHEN b.r_null < 0.15 THEN NULL ELSE round(exp(5 + 1.0 * (random() + random() + random() - 1.5) * 2))::int END,
  ('10.' || (b.urn % 6) || '.' || floor(random() * 50)::int || '.' || (1 + floor(random() * 6)::int))::inet,
  'Mozilla/5.0 perf-' || (b.g % 8),
  date_trunc('day', b.day_ts) + (CASE WHEN b.r_hour < 0.9 THEN 8 + floor(random() * 10) ELSE floor(random() * 24) END || ' hours')::interval
    + (random() * 3600 || ' seconds')::interval
FROM base b JOIN u ON u.rn = b.urn;

ANALYZE app.query_logs;
SELECT count(*), count(DISTINCT ip) ips, count(DISTINCT user_id) users, count(DISTINCT datasource_code) ds,
  min(created_at), max(created_at), count(duration_ms) with_dur, pg_size_pretty(pg_total_relation_size('app.query_logs')) size FROM app.query_logs;
