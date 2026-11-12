# Code review: admin drill-down + insights (uncommitted) - 2026-11-11

Scope: apps/api history/**, query-stats/**, query-insights/**, audit/**, common/csv, main.ts, seed.ts; shared types; web features history / admin/query-stats / admin/query-insights; routes, sidebar, api-client; new e2e tests. Read-only review. Unit tests run: 11 suites / 91 pass (history, query-stats, query-insights, audit, csv). E2E (needs DB) not run. Excluded: docs/checking.txt, demo scripts, config.json.bak, migration phase 08.

## Verdict
Solid. Single where-builder, whitelisted ORDER BY, all values bound, scope forced server-side, audit capture:'request' verified (unit test + e2e), CSV escaping correct. No Critical. No privilege-bypass found. Real issues are Medium/Low below.

## Critical
None.

## High
None confirmed. (H-candidate downgraded to Medium: M1 below.)

## Medium

M1. Invalid/garbage IP silently drops the query log row. history `QueryLogService.record` (query-log.service.ts:64-81) writes `ip: request.ip` into an `inet` column. With TRUST_PROXY=true (or a hop count larger than real proxies) express returns the raw leftmost X-Forwarded-For token, which a client can set to `foo`. Postgres rejects the cast, the catch at :82 swallows it -> the lookup is NOT logged (audit-evasion, and denied rows via datasource-permission.guard.ts:56 too). Fix: validate with `net.isIP()` and store null otherwise (in record()), and recommend 'loopback, uniquelocal' or exact hop count in docs.

M2. IPv4-mapped IPv6 not normalised. Node dual-stack gives `::ffff:10.0.0.1` for direct peers (TRUST_PROXY off, the default). Stored as IPv6 inet, so filter `ip=10.0.0.1` (query-log-where-sql.builder.ts:40), `/ips/10.0.0.1/activity`, and shared-IP grouping (anomaly repo :93-99) split the same host in two. Fix: strip `::ffff:` prefix at write time (same place as M1).

M3. TRUST_PROXY default off => behind nginx/docker every row has the proxy IP, making ip filters / shared-IP / ip-activity meaningless and a false "shared IP" for all users. deployment-guide.md has no TRUST_PROXY mention (only .env.example). `true` trusts every hop => X-Forwarded-For spoofable => defeats shared-IP detection. Unknown string (e.g. `yes`) makes express throw at boot (fail-fast but undocumented; util.spec only 7 lines, no invalid case). Add docs + startup log of effective value.

M4. Gap metric inconsistent for success rows with NULL record_count. query-insights-top-sql.repository.ts:32 `COUNT(*) FILTER (WHERE NOT (status='success' AND record_count > 0))` evaluates to NULL (excluded) when success + record_count NULL, whereas where-builder.ts:34 and COUNTERS (requests-answered) treat it as gap. Effect: top-users `metric=gap` HAVING/ORDER BY hides or under-ranks users whose gaps are NULL-record_count rows, while displayed `gap` column counts them. Fix: add `COALESCE(record_count,0)`. (QueryService always sets recordCount from envelope so NULL is rare today, but legacy rows/other writers can have it; no test covers it.)

M5. Time input boundary loses last minute. history-datetime-input.tsx:113-117: `to` with time HH:mm becomes exclusive `date HH:mm:00`. Choosing 23:59 (or 17:00) drops rows in that last minute (23:59:00-23:59:59.999). Date-only is correct (next VN midnight). Fix: for `to`+time, add 1 minute (inclusive-minute semantics) or label as exclusive.

M6. Unbounded range on /history, /history/summary, /history/export.csv. `from/to` optional: `COUNT(*)` + `percentile_cont(0.95)` over whole table per request (summary p95 sorts all durations), export does `count` then up to 50 keyset batches; no throttle/concurrency limit on export (50k rows x N concurrent admins). Offset is capped (10k) but count is not. Stats/Insights are bounded (366 / 90 days). Suggest: default range or max range for summary/export, per-user export concurrency/rate limit. Phase 08 index work may cover part; confirm.

M7. FE path injection via `?detail=`. history-api.ts:146 `/history/${id}` unencoded and not uuid-checked (history-search-params.ts:87 only trims). `?detail=../admin/audit-logs` makes fetch hit another GET API as the current user (dot-segments normalised by browser). Impact: crafted link triggers unintended authenticated GET (read-only, response mis-rendered) - low exploit value, easy fix: validate uuid in parse + `encodeURIComponent`.

M8. Anomaly CSV recomputes all four anomaly queries for one table (query-insights-csv.service.ts:41-42 calls `insights.anomalies()` then picks one). 4 heavy scans (jsonb_each_text across up to 90 days) per export click. Fix: call only the needed repo query; DRY with the JSON endpoints.

## Low

L1. Spike rule with zero baseline (anomaly repo :42): `cnt*7 >= 3*base_sum` is true when base_sum=0, so any new/first-ever user with >=20 queries on a day is a "spike" (also pseudo-user `user_id NULL` aggregates all deleted users into one partition, :35). Intended? (question Q1)
L2. FE normalisers accept values backend rejects: `from/to` `2026-02-31` or `2026-11-11T10:00` (no offset) pass `isDatetime` (history-search-params.ts:18) -> 422 shown as raw message; `page` max 1000 vs backend page*pageSize<=10000 (handled by offsetLimitHint only for 422, OK). Use same validator as server.
L3. `COALESCE(SUM(record_count),0)::int` (counters.sql:10) overflows int4 at >2.1B total records; use ::float8/bigint-to-number.
L4. Audit `filters: request.query` (audit.interceptor.ts:91) stores the raw unvalidated query (arbitrary keys/size; secrets keys redacted by stripSecrets only). Prefer the validated/pipe-parsed filter or whitelist QUERY_LOG_FILTER_KEYS. Contains username/ip filters (PII-ish but not CCCD).
L5. `mapper.maskedParams` comment says "fall back to the stored values" when datasource unresolved, but code returns empty params (safe direction). Fix comment. If a datasource's sensitive field is renamed in config, old rows' raw value is shown to non-sensitive viewers (only fields currently in config are projected; renamed ones dropped -> safe; sensitive flag removed -> raw shown). Document.
L6. CSV: `errorMessage`, `userAgent`, `upstreamRequestId` exported unmasked (currently static/translated messages, so OK); add test guard if error messages ever embed input. Formula-prefix regex fine for = + - @ TAB CR; numbers unquoted (fine).
L7. Insights `sharedIdentities` returns `jsonb_agg` of all users per value then slices 20 in JS (service :116) - slice in SQL.
L8. Export audit row is written when handler returns (before stream drains); a stream aborted mid-way is still audited as full `exported` count. Acceptable; note in doc.
L9. File size: no file >200 lines in scope (largest web 175). Tests: e2e use real DB (not mocks) - good. Duplicate `saveBlob` in two FE buttons (history-export-csv-button.tsx, query-insights-export-csv-button.tsx) - extract. `ANOMALY_LIST_SEP` constant vs literal chr(31) duplicated in SQL.

## Checked and OK (no issue)
- AuthZ: list/detail view_own|view_all; summary, datasources, all insights routes view_all; export.csv history:export + (view_all or view_own) check in service; insights export: method-level override (getAllAndOverride) -> only history:export, in-handler view_all check at controller :83. e2e asserts 403 matrix (view_own, export-only, view_all-without-export).
- view_own: userId/username/ip ignored via forcedUserId (builder :36,:55); /history/:id of others -> 404 (service :55); export scoped.
- SQL: all params bound; Prisma.raw only for whitelisted constants (sort col, bucket unit/fmt, metric, frame from numeric constants); LIKE escape with ESCAPE '\\' correct; jsonb_each_text guarded with jsonb_typeof; unnest pairs parameterised.
- Time: fixed UTC+7 half-open [from,to); date-only `to` = next VN midnight; last_month in January rolls via Date.UTC (spec covers); previous-period caps elapsed; bucket cap 800 -> 422; custom range <=366d; off-hours ISODOW 6,7 or hour <7 / >=18 correct; p95 percentile_cont, avg exact via sum/count; no divide-by-zero (ratio guarded, successRate null).
- Mask on shared identities: value masked unless view_sensitive in JSON and CSV (same service path).
- FE: no dangerouslySetInnerHTML; IPv6/userId encoded in paths; permission hiding is UX only, backend enforces; related-links gated by canViewAll; summary query `enabled: canViewAll`.

## Unresolved questions
Q1. Spike on first-day/new users (baseline 0): intended to flag? Minimum-baseline guard wanted?
Q2. Should AUDITOR (has history:view_all, no export) see Insights incl. per-user/IP drill-down and shared IPs? Currently yes (masked CCCD only).
Q3. Should `to` with HH:mm be inclusive-minute or exclusive? (M5)
Q4. Is query_logs.created_at DB-default now() or app-set? (export pins `to=app now`; DB/app clock skew would drop rows.)
Q5. Will existing prod DBs get `history:export` / `admin:query_stats` permissions and ADMIN grants via seed re-run (docker entrypoint) - not verified.
Q6. Phase 08 index plan: does it cover (created_at,id), user_id, ip, datasource_code for these unbounded history queries?
