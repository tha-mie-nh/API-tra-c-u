-- EXPLAIN các truy vấn thật (phase 08) trên DB perf. Chạy: psql ... -f scripts/perf-explain-query-logs.sql
-- Mỗi truy vấn gắn nhãn "-- Q:" để script tóm tắt trích thời gian.
\set ON_ERROR_STOP on
\set from30 '''now''::timestamptz - interval ''30 days'''
\timing off
\echo '== Q:list-30d-default'
EXPLAIN (ANALYZE, BUFFERS) SELECT id, user_id, username_snapshot, datasource_code, query_params, status::text, status_code, error_code, record_count, upstream_request_id, duration_ms, host(ip), user_agent, created_at FROM app.query_logs WHERE created_at >= now() - interval '30 days' AND created_at < now() ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 20 OFFSET 0;
\echo '== Q:list-30d-offset9980'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM app.query_logs WHERE created_at >= now() - interval '30 days' AND created_at < now() ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 20 OFFSET 9980;
\echo '== Q:list-30d-sort-duration'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM app.query_logs WHERE created_at >= now() - interval '30 days' AND created_at < now() ORDER BY duration_ms DESC NULLS LAST, id DESC LIMIT 20 OFFSET 0;
\echo '== Q:list-366d-default'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM app.query_logs WHERE created_at >= now() - interval '366 days' AND created_at < now() ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 20 OFFSET 0;
\echo '== Q:list-30d-statusCode504'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM app.query_logs WHERE created_at >= now() - interval '30 days' AND status_code = 504 ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 20;
\echo '== Q:list-30d-errorCode'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM app.query_logs WHERE created_at >= now() - interval '30 days' AND error_code = 'UPSTREAM_TIMEOUT' ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 20;
\echo '== Q:list-30d-duration-range'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM app.query_logs WHERE created_at >= now() - interval '30 days' AND duration_ms >= 1000 AND duration_ms <= 5000 ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 20;
\echo '== Q:list-30d-outcome-gap'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM app.query_logs WHERE created_at >= now() - interval '30 days' AND NOT (status = 'success' AND COALESCE(record_count,0) > 0) ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 20;
\echo '== Q:list-30d-ip'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM app.query_logs WHERE created_at >= now() - interval '30 days' AND ip = '10.2.7.3'::inet ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 20;
\echo '== Q:list-noRange-ip'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM app.query_logs WHERE ip = '10.2.7.3'::inet ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 20;
\echo '== Q:list-noRange-upstreamRequestId'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM app.query_logs WHERE upstream_request_id = md5('777777') ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 20;
\echo '== Q:list-30d-upstreamRequestId'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM app.query_logs WHERE created_at >= now() - interval '30 days' AND upstream_request_id = md5('777777') ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 20;
\echo '== Q:count-30d'
EXPLAIN (ANALYZE, BUFFERS) SELECT COUNT(*)::int FROM app.query_logs WHERE created_at >= now() - interval '30 days' AND created_at < now();
\echo '== Q:count-366d'
EXPLAIN (ANALYZE, BUFFERS) SELECT COUNT(*)::int FROM app.query_logs WHERE created_at >= now() - interval '366 days' AND created_at < now();
\echo '== Q:count-30d-statusCode'
EXPLAIN (ANALYZE, BUFFERS) SELECT COUNT(*)::int FROM app.query_logs WHERE created_at >= now() - interval '30 days' AND status_code = 504;
\echo '== Q:summary-p95-30d'
EXPLAIN (ANALYZE, BUFFERS) SELECT COUNT(*)::int, (COUNT(*) FILTER (WHERE status='success' AND record_count>0))::int, ROUND(AVG(duration_ms))::int, ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int FROM app.query_logs WHERE created_at >= now() - interval '30 days' AND created_at < now();
\echo '== Q:summary-p95-366d'
EXPLAIN (ANALYZE, BUFFERS) SELECT COUNT(*)::int, (COUNT(*) FILTER (WHERE status='success' AND record_count>0))::int, ROUND(AVG(duration_ms))::int, ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int FROM app.query_logs WHERE created_at >= now() - interval '366 days' AND created_at < now();
\echo '== Q:ip-page-totals-noRange'
EXPLAIN (ANALYZE, BUFFERS) SELECT COUNT(*)::int, (COUNT(*) FILTER (WHERE status='success'))::int, COALESCE(SUM(record_count),0)::int, ROUND(AVG(duration_ms))::int FROM app.query_logs WHERE ip = '10.2.7.3'::inet;
\echo '== Q:ip-page-span-noRange'
EXPLAIN (ANALYZE, BUFFERS) SELECT MIN(created_at), MAX(created_at) FROM app.query_logs WHERE ip = '10.2.7.3'::inet;
\echo '== Q:ip-page-users-noRange'
EXPLAIN (ANALYZE, BUFFERS) SELECT user_id::text, MAX(username_snapshot), COUNT(*)::int, MIN(created_at), MAX(created_at) FROM app.query_logs WHERE ip = '10.2.7.3'::inet GROUP BY user_id ORDER BY 3 DESC, user_id ASC NULLS LAST LIMIT 100;
\echo '== Q:user-page-span-allTime'
EXPLAIN (ANALYZE, BUFFERS) SELECT MIN(created_at), MAX(created_at) FROM app.query_logs WHERE user_id = (SELECT id FROM app.users WHERE username='perf_user_3');
\echo '== Q:user-page-ips-90d'
EXPLAIN (ANALYZE, BUFFERS) SELECT host(ip), COUNT(*)::int, MIN(created_at), MAX(created_at) FROM app.query_logs WHERE created_at >= now() - interval '90 days' AND user_id = (SELECT id FROM app.users WHERE username='perf_user_3') AND ip IS NOT NULL GROUP BY ip ORDER BY 2 DESC, ip LIMIT 100;
\echo '== Q:user-page-byDatasource-90d'
EXPLAIN (ANALYZE, BUFFERS) SELECT datasource_code, COUNT(*)::int FROM app.query_logs WHERE created_at >= now() - interval '90 days' AND user_id = (SELECT id FROM app.users WHERE username='perf_user_3') GROUP BY 1 ORDER BY 2 DESC;
\echo '== Q:stats-overview-by-datasource-366d'
EXPLAIN (ANALYZE, BUFFERS) SELECT datasource_code, COUNT(*)::int, (COUNT(*) FILTER (WHERE status='success' AND record_count>0))::int, COALESCE(SUM(record_count),0)::int, ROUND(AVG(duration_ms))::int, COALESCE(SUM(duration_ms),0)::float8, COUNT(duration_ms)::int FROM app.query_logs WHERE created_at >= now() - interval '366 days' AND created_at < now() GROUP BY 1 ORDER BY 2 DESC;
\echo '== Q:stats-timeseries-hour-90d'
EXPLAIN (ANALYZE, BUFFERS) SELECT to_char(date_trunc('hour', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD"T"HH24') b, COUNT(*)::int, (COUNT(*) FILTER (WHERE status='success' AND record_count>0))::int, COALESCE(SUM(duration_ms),0)::float8 FROM app.query_logs WHERE created_at >= now() - interval '90 days' AND created_at < now() GROUP BY 1 ORDER BY 1;
\echo '== Q:stats-timeseries-day-366d'
EXPLAIN (ANALYZE, BUFFERS) SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD') b, COUNT(*)::int, (COUNT(*) FILTER (WHERE status='success' AND record_count>0))::int, COALESCE(SUM(duration_ms),0)::float8 FROM app.query_logs WHERE created_at >= now() - interval '366 days' AND created_at < now() GROUP BY 1 ORDER BY 1;
\echo '== Q:stats-timeseries-month-366d'
EXPLAIN (ANALYZE, BUFFERS) SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM') b, COUNT(*)::int, (COUNT(*) FILTER (WHERE status='success' AND record_count>0))::int, COALESCE(SUM(duration_ms),0)::float8 FROM app.query_logs WHERE created_at >= now() - interval '366 days' AND created_at < now() GROUP BY 1 ORDER BY 1;
\echo '== Q:stats-topErrors-366d'
EXPLAIN (ANALYZE, BUFFERS) SELECT error_code, status_code, COUNT(*)::int c FROM app.query_logs WHERE created_at >= now() - interval '366 days' AND created_at < now() AND status <> 'success' GROUP BY 1,2 ORDER BY c DESC LIMIT 10;
\echo '== Q:insights-top-users-90d'
EXPLAIN (ANALYZE, BUFFERS) SELECT user_id::text, MAX(username_snapshot), COUNT(*)::int, (COUNT(*) FILTER (WHERE status='success' AND record_count>0))::int, ROUND(AVG(duration_ms))::int, ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int, MAX(created_at) FROM app.query_logs WHERE created_at >= now() - interval '90 days' AND created_at < now() GROUP BY user_id HAVING COUNT(*) > 0 ORDER BY COUNT(*) DESC, COUNT(*) DESC, user_id ASC NULLS LAST LIMIT 10;
\echo '== Q:insights-top-errors-90d'
EXPLAIN (ANALYZE, BUFFERS) SELECT error_code, status_code, COUNT(*)::int c FROM app.query_logs WHERE created_at >= now() - interval '90 days' AND created_at < now() AND status <> 'success' GROUP BY 1,2 ORDER BY c DESC LIMIT 10;
\echo '== Q:insights-latency-90d'
EXPLAIN (ANALYZE, BUFFERS) SELECT datasource_code, COUNT(*)::int, ROUND(AVG(duration_ms))::int, ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int, MAX(duration_ms)::int FROM app.query_logs WHERE created_at >= now() - interval '90 days' AND created_at < now() GROUP BY datasource_code ORDER BY 4 DESC NULLS LAST;
\echo '== Q:anomaly-spikes-90d+baseline'
EXPLAIN (ANALYZE, BUFFERS) WITH daily AS (SELECT user_id, MAX(username_snapshot) AS username, date_trunc('day', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day, COUNT(*)::int AS cnt FROM app.query_logs WHERE created_at >= now() - interval '120 days' AND created_at < now() GROUP BY user_id, 3), w AS (SELECT *, COALESCE(SUM(cnt) OVER (PARTITION BY user_id ORDER BY day RANGE BETWEEN INTERVAL '30 days' PRECEDING AND INTERVAL '1 day' PRECEDING),0)::int AS base_sum FROM daily) SELECT user_id::text, username, to_char(day,'YYYY-MM-DD'), cnt, ROUND(base_sum::numeric/30,2) FROM w WHERE day >= date_trunc('day',(now() - interval '90 days') AT TIME ZONE 'Asia/Ho_Chi_Minh') AND cnt >= 50 AND cnt*30 >= 3*base_sum ORDER BY cnt DESC LIMIT 50;
\echo '== Q:anomaly-offHours-90d'
EXPLAIN (ANALYZE, BUFFERS) SELECT user_id::text, MAX(username_snapshot), COUNT(*)::int, (COUNT(*) FILTER (WHERE (EXTRACT(ISODOW FROM created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') IN (6,7) OR EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') NOT BETWEEN 7 AND 18)))::int off_count FROM app.query_logs WHERE created_at >= now() - interval '90 days' AND created_at < now() GROUP BY user_id HAVING COUNT(*) FILTER (WHERE (EXTRACT(ISODOW FROM created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') IN (6,7) OR EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') NOT BETWEEN 7 AND 18)) >= 1 ORDER BY off_count DESC LIMIT 50;
\echo '== Q:anomaly-sharedIdentity-90d'
EXPLAIN (ANALYZE, BUFFERS) WITH hits AS (SELECT upper(btrim(p.value)) AS val, p.key AS fkey, datasource_code AS ds, user_id, username_snapshot, created_at FROM app.query_logs CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(query_params)='object' THEN query_params ELSE '{}'::jsonb END) AS p(key,value) WHERE created_at >= now() - interval '90 days' AND created_at < now() AND user_id IS NOT NULL AND status <> 'denied' AND btrim(p.value) <> '' AND p.value NOT LIKE '%*%' AND (datasource_code, p.key) IN (SELECT * FROM unnest(ARRAY['ds_01','ds_02','ds_03','ds_04']::text[], ARRAY['citizenId','citizenId','citizenId','citizenId']::text[]))), per_user AS (SELECT val, user_id, MAX(username_snapshot) AS username, COUNT(*)::int AS c, MIN(created_at) AS first_at, MAX(created_at) AS last_at, string_agg(DISTINCT fkey, chr(31)) AS fkeys, string_agg(DISTINCT ds, chr(31)) AS dss FROM hits GROUP BY val, user_id) SELECT val, COUNT(*)::int AS du, SUM(c)::int, string_agg(DISTINCT fkeys, chr(31)), string_agg(DISTINCT dss, chr(31)), jsonb_agg(jsonb_build_object('userId', user_id::text,'username',username,'count',c) ORDER BY c DESC, username), MIN(first_at), MAX(last_at) FROM per_user GROUP BY val HAVING COUNT(*) >= 3 ORDER BY du DESC LIMIT 50;
\echo '== Q:anomaly-sharedIps-90d'
EXPLAIN (ANALYZE, BUFFERS) SELECT host(ip), COUNT(DISTINCT user_id)::int du, (array_agg(DISTINCT username_snapshot))[1:10], COUNT(*)::int, MAX(created_at) FROM app.query_logs WHERE created_at >= now() - interval '90 days' AND created_at < now() AND ip IS NOT NULL AND user_id IS NOT NULL GROUP BY ip HAVING COUNT(DISTINCT user_id) >= 3 ORDER BY du DESC LIMIT 50;
