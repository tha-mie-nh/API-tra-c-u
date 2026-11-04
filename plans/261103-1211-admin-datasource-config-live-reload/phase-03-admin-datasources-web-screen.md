# Phase 03 — Admin datasources screen (web)

## Context Links
- Precedent: `apps/web/src/features/admin/roles/*` (page, table, form dialog, `*-api.ts`, `*-form-schema.ts`), `i18n/vi-admin-roles.ts`
- `apps/web/src/routes/app-routes.tsx` (`quan-tri/*` + `RequirePermission anyOf`), `components/layout/sidebar-nav.tsx`
- `apps/web/src/lib/api-client.ts` (`ApiError.details[{path,message}]`)
- `apps/web/src/features/datasources/use-datasources.ts` (query key `['datasources']`, staleTime 60s)

## Overview
- Priority: P2 · Status: done
- Route `/quan-tri/nguon-du-lieu`, nav item gated by `admin:datasources`. List + toggle + delete + create/edit dialog.

## Key Insights / Form decision
**Hybrid: structured fields for simple parts + JSON textareas for `input` and `output`.** Justification:
- `input.fields` (validation props, options, mapTo, atLeastOneOf/requireGroups) and `output` (recordsPath, field mapping, valueMap, iconMap, imageRef, identity/timestamp refs) are the bulk of the schema and change rarely; a visual builder = nested field arrays + cross-refs ≈ 3-4x the work, and must chase every future DSL addition.
- Transport/meta fields are what admins actually change (switch mock->http, set baseUrl, key env name, enable). Those get proper inputs.
- No client-side AJV: server already validates with the single schema and returns path-mapped 422 details; client only does `JSON.parse` check. Avoids second schema copy in the web bundle + an `ajv` dep. Plain `<Textarea>` monospace (no CodeMirror — YAGNI).
- "Sao chép từ nguồn có sẵn" select on create prefills all fields from an existing entry — realistic workflow, near-zero cost.

Structured fields: `code` (create only, `^[A-Z][A-Z0-9_]*$`), `name`, `description`, `type` (info/image), `enabled`, `transport.kind` (mock|http), mock: `dataFile`; http: `baseUrl` (literal or `${X_BASE_URL}` picker), `path`, `method`, `timeoutMs`, `headers` (key/value rows), `auth.kind` (none|apiKeyHeader|bearer|basic), `auth.header`, `auth.valueEnv` (select from `/env-refs` + free text), `limits.maxResults/pageSize`. `permissionCode` shown read-only (derived).

## Requirements
- Toggle switch per row -> PATCH; delete with AlertDialog confirm (warn: permission rows kept, history kept).
- Show `envStatus` badge (env var missing => "Chưa có biến môi trường — cần DevOps thêm vào .env.prod + khởi động lại").
- Precondition notice in create dialog re new env vars (decision #2).
- 422 details: map path prefix `input.`/`output.` to the matching textarea error, others to field errors, unknown -> form-level list.
- After any mutation: invalidate `['admin-datasources']`, `['datasources']`, and refetch `/auth/me` (new `api:*` grant to ADMIN appears in nav).
- Vietnamese copy in new `i18n/vi-admin-datasources.ts`.

## Architecture
```
DatasourcesAdminPage
 ├─ DatasourcesAdminTable (name, code, kind, enabled toggle, envStatus, actions)
 └─ DatasourceFormDialog (react-hook-form + zod for structured part)
     ├─ DatasourceTransportFields (mock|http subform)
     └─ JsonBlockTextarea x2 (input, output)
```

## Related Code Files
- Create (`apps/web/src/features/admin/datasources/`): `datasources-admin-api.ts`, `datasources-admin-page.tsx`, `datasources-admin-table.tsx`, `datasource-form-dialog.tsx`, `datasource-form-schema.ts`, `datasource-transport-fields.tsx`, `json-block-textarea.tsx`, `map-datasource-validation-errors.ts`; `apps/web/src/i18n/vi-admin-datasources.ts`
- Modify: `routes/app-routes.tsx` (lazy route), `components/layout/sidebar-nav.tsx` (nav item + `showAdminSection`), `i18n/vi.ts` (nav label)
- Delete: none

## Implementation Steps
1. API client fns mirroring `roles-api.ts`.
2. Zod form schema (structured part only); form value <-> `DatasourceEntry` converters (pure, testable).
3. Transport subform with conditional fields by kind.
4. JSON textarea component: parse on blur, inline parse error, pretty-print button.
5. Dialog: create (with copy-from) / edit (code read-only); submit -> map 422 errors.
6. Table + page with toggle/delete; invalidate queries.
7. Route + nav + i18n.
8. `pnpm --filter web build` (tsc) + lint.

## Todo List
- [x] api client + types
- [x] form schema + converters
- [x] transport subform, JSON textarea
- [x] form dialog (create/copy/edit) + error mapping
- [x] table + page (toggle, delete)
- [x] route, nav, i18n
- [x] build + lint

## Implementation Notes (post-completion)
- Files created under `apps/web/src/features/admin/datasources/`:
  `datasources-admin-api.ts` (API client + `syncAfterDatasourceMutation`
  helper — invalidates `['admin-datasources']`/`['datasources']` and
  refetches `/auth/me` via `auth-api.ts`'s `fetchMe` + `useAuthStore.setSession`,
  since a write can grant/revoke the matching `api:*` permission),
  `datasource-form-schema.ts` (zod, structured fields only),
  `datasource-entry-converters.ts` (pure `entryToFormValues`/
  `formValuesToEntryPayload`, spreads the original `transport` object before
  overlaying edited fields so unknown keys like `retry` survive edits — Risk
  Assessment item), `datasource-identity-fields.tsx` + `datasource-transport-fields.tsx`
  (split out of the dialog purely to stay under ~200 lines/file — same
  responsibilities as planned, no behavior change), `json-block-textarea.tsx`
  (parse-on-blur + pretty-print button, no CodeMirror/AJV), `datasource-form-dialog.tsx`
  (create/copy-from/edit + 422 error mapping), `datasources-admin-table.tsx`,
  `datasources-admin-page.tsx`, plus `apps/web/src/i18n/vi-admin-datasources.ts`.
  Modified: `apps/web/src/routes/app-routes.tsx` (lazy route), `components/layout/sidebar-nav.tsx`
  (nav item + `showAdminSection`), `i18n/vi.ts` (merge + nav label).
  Also added `apps/web/src/components/ui/switch.tsx` (not in the original
  file list — no Switch primitive existed yet; generated via
  `pnpm exec shadcn add switch` to match the project's existing shadcn
  component style exactly, same as `checkbox.tsx`/`badge.tsx`).
- `map-datasource-validation-errors.ts` maps the REAL phase-02 422 contract
  (slash-joined relative paths, e.g. `transport/auth/valueEnv`; empty path
  `''` for cross-field issues) to per-field RHF errors / JSON-textarea
  errors / a form-level list — verified against the live API (see below),
  not just read from phase-02's doc.
- Deviation: reload-from-disk (`POST /admin/datasources/reload`) is NOT
  wired into this screen — phase-03 Requirements never listed it (only
  toggle/delete/create/edit/error-mapping/envStatus/i18n); it's a
  DevOps-facing escape hatch for hand edits, YAGNI to add a button for it
  here. Flagging in case Phase 05 or a reviewer expects UI coverage for it.
- Verification performed LIVE against the real stack, not just reading
  code: started `postgres` (docker compose), ran `db:migrate:deploy` +
  `db:seed`, used `reset-admin-password admin` (purpose-built recovery
  script) to get a temp password since the bootstrap password wasn't
  known, started `pnpm dev` (real NestJS api on :3000 + Vite web on :5173),
  then via `curl` with a real JWT: `GET /admin/datasources` (11 real
  entries), `GET /admin/datasources/env-refs` (real env names only),
  `POST` with `auth.valueEnv=JWT_ACCESS_SECRET` -> confirmed 422 **with
  `details` array actually present in the HTTP body** (phase-02's flagged
  "known gap" in `http-exception.filter.ts` is fixed and now verified
  live, not just unit-tested), valid `POST` -> 201 live entry, `PATCH
  .../enabled {enabled:true}` -> immediately appeared in `GET /datasources`
  AND `GET /auth/me`'s `permissions[]` with **zero restart** (this
  screen's whole value proposition), two more invalid `PUT`s to confirm
  both 422 shapes map correctly (`path:''` cross-field issue ->
  form-level list per my mapper; `path:'output/fields/0'` AJV issue ->
  output-textarea bucket per my mapper), then `DELETE` to clean up.
  `config/config.json` was restored via `git checkout` and the stray
  `.bak` deleted afterward — repo left byte-identical to before.
  `pnpm --filter web typecheck`/`lint`/`build`/`test` (43/43) all green.
  Did NOT visually click through the UI in a browser (no browser/screenshot
  tool available in this session) — confirmed `GET /quan-tri/nguon-du-lieu`
  returns 200 through Vite's SPA fallback and `/api/v1/health` proxies
  correctly, but the dialog/table/form interactions themselves are
  verified by code reading + the API-level error-contract tests above,
  not a live click-through.
- Side effects left on the local dev environment (not production, not
  committed): admin's password was reset via `reset-admin-password` (new
  temp password known only to this session's transcript, forces
  `mustChangePassword` on next login — already the seeded default); `api`
  (NestJS, :3000) and `web` (Vite, :5173) dev servers plus the `postgres`
  docker container were left running (could not stop them — sandbox
  denied process-kill as "Interfere With Workloads"); user may want to
  `docker compose down` / stop the `pnpm dev` process manually.

## Success Criteria
- Admin creates an http datasource referencing an existing `*_API_KEY` var -> it appears in sidebar without page reload or api restart.
- Invalid JSON/schema errors shown next to the right field; nothing saved.
- Non-admin: no nav item; direct URL -> 403 page.

## Risk Assessment
- Form/entry converter drops unknown keys (e.g. `transport.retry`) on edit -> converter must spread original transport then overlay edited keys; unit test round-trip.
- Files >200 lines -> split subform/textarea as listed.

## Security Considerations
- UI never has a field for secret values; `valueEnv` labelled "Tên biến môi trường (không phải giá trị)".
- Header value inputs carry warning not to paste keys there.

## Next Steps
- Phase 05 component tests. The real 422 path format is slash-joined,
  relative to the entry, and empty-string for cross-field issues — any
  unit test for `map-datasource-validation-errors.ts` should assert
  exactly those shapes (mirror the curl payloads/responses in
  "Implementation Notes" above).

## Follow-up: visual input/output field editor (2026-11-04)
Replaced the raw-JSON `inputJson`/`outputJson` textareas (`json-block-textarea.tsx`,
now deleted) with a structured, row-based field builder — frontend-only,
zero backend changes (server still only sees `input`/`output` as JSON
objects in the request body, same shape as before). New files:
`datasource-field-row-types.ts` (row zod schemas), `datasource-field-row-converters.ts`
(row <-> `InputFieldDef`/`OutputFieldDef` DSL conversion), `datasource-pair-rows-editor.tsx`
(reusable key/value row list — `options`/`valueMap`/`iconMap`),
`datasource-input-field-row.tsx` + `datasource-input-fields-editor.tsx`
(fields table with add/remove/reorder via `useFieldArray.move`, `atLeastOneOf`
checklist, minimal `requireGroups` repeated-multiselect), `datasource-output-field-row.tsx`
+ `datasource-output-fields-editor.tsx` (same pattern + `timestampField`/
`identityField` as SELECTs sourced from the live field-name list — prevents
the exact cross-field error the server checks for — + a collapsed `imageRef`
advanced section). `datasource-form-schema.ts`/`datasource-entry-converters.ts`/
`map-datasource-validation-errors.ts` updated accordingly (422 paths like
`output/fields/2/from` now map onto `outputFields.2.from`, not a flat
textarea bucket). No raw-JSON escape hatch was added — the config DSL is
`additionalProperties: false` throughout, so the structured rows cover
100% of it; see `fullstack-developer` report
(`plans/reports/fullstack-developer-261104-1122-visual-datasource-field-builder.md`
if written) for full verification notes. Live UI click-through (login as
ADMIN -> create via the new builder -> confirm it appears in the query
page with no restart) was NOT performed this session — the sandbox blocks
credential/login actions, and this session has no known admin password
(a prior session reset it and didn't record the new value anywhere
persistent). Verified instead: full web test suite incl. new row
add/remove/reorder + converter round-trip tests, typecheck/lint/build all
green, and a throwaway api-side spec (written, run, then deleted) proving
a payload shaped exactly like the new builder's output — enum options,
`atLeastOneOf`, `requireGroups`, `valueMap`, `imageRef` — passes the real
`buildConfigSnapshot` (AJV + cross-field) unchanged.
