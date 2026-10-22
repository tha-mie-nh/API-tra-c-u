/**
 * Phase 04 — TS types for the `config.json` DSL (see
 * plans/260920-2200-app-tra-cuu-du-lieu/reference-config-schema.md, the
 * single source of truth for this shape). Shared between `apps/api`
 * (DatasourceConfigLoader/Registry) and `apps/web` (dynamic form/table
 * renderer, once Phase 07 consumes `ClientDatasource`).
 *
 * Two projections, matching design rule #3 of the reference doc:
 * - `DatasourceEntry` (+ `TransportConfig`) = SERVER projection (full, incl.
 *   `transport` — never leaves the backend).
 * - `ClientDatasource` = the redacted, permission-filtered projection served
 *   by `GET /api/v1/datasources` (no `transport`, no `internal` output fields).
 */

/**
 * Field-type vocabulary shared by input and output field definitions.
 * `image` is output-only: value is a base64 data URI rendered inline (no
 * MinIO/proxy involved) — see `find-driverlicense`/`find-face` upstream
 * APIs that return a `hinhAnh` field this way.
 */
export type FieldType = 'string' | 'number' | 'date' | 'datetime' | 'enum' | 'boolean' | 'image';

export interface FieldOption {
  value: string;
  label: string;
}

/** One entry of `datasources[].input.fields[]`. */
export interface InputFieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  options?: FieldOption[];
  format?: string;
  /** Upstream request key this field is sent as (server-only concern, but harmless to share). */
  mapTo?: string;
}

/** One entry of `datasources[].output.fields[]`. */
export interface OutputFieldDef {
  name: string;
  label: string;
  /** Upstream response key this field is renamed from. Absent for computed/internal-only fields. */
  from?: string;
  type: FieldType;
  /** Code -> display label, applied server-side before the client ever sees the value. */
  valueMap?: Record<string, string>;
  /** Mask this field's value in logs/audit (still sent to an authorized client). */
  sensitive?: boolean;
  /** Never sent to the client; used server-side only (e.g. to build image URLs). */
  internal?: boolean;
  /** Render this column's value in bold (e.g. a direction/status that needs
   * to stand out next to a timestamp column). */
  emphasize?: boolean;
  /** Display label (post-`valueMap`) -> icon key, rendered next to the
   * value. Icon keys are a small fixed vocabulary the client renderer
   * knows (see `apps/web`'s icon-by-key table) — not arbitrary icon names. */
  iconMap?: Record<string, string>;
  /** Render this column's value next to the record's timestamp instead of
   * in the field grid (e.g. a direction/status that belongs with "when"). */
  headerField?: boolean;
}

export type TransportAuthKind = 'apiKeyHeader' | 'bearer' | 'basic' | 'none';

export interface TransportAuth {
  kind: TransportAuthKind;
  header?: string;
  /** Env var NAME holding the credential value — never the value itself. */
  valueEnv?: string;
}

export interface TransportRetry {
  attempts: number;
  backoffMs: number;
}

/** Real upstream HTTP API (used once the 3 real "citizen info" APIs are documented). */
export interface TransportHttp {
  kind: 'http';
  baseUrl: string;
  path: string;
  method: 'GET' | 'POST';
  auth?: TransportAuth;
  /**
   * Static, non-secret request headers (e.g. `X-Request-Type`) sent on every
   * call — the checking-api upstreams all share one `/find` endpoint and are
   * routed by this header, not by path. Secrets never belong here; use `auth`.
   */
  headers?: Record<string, string>;
  timeoutMs?: number;
  retry?: TransportRetry;
}

/**
 * Stand-in for an undocumented upstream API. `dataFile` (relative to
 * `config/`) is a Phase-04 addition beyond reference-config-schema.md's
 * example: the mock adapter must itself be config-driven (which fixture it
 * reads), otherwise it would not prove the "generic engine" claim.
 */
export interface TransportMock {
  kind: 'mock';
  dataFile: string;
  timeoutMs?: number;
}

/** Our own MinIO + Postgres image store (metadata only; bytes served by Phase 05). */
export interface TransportMinioPg {
  kind: 'minio-pg';
  pgUrlEnv: string;
  minio: {
    endpointEnv: string;
    portEnv?: string;
    accessKeyEnv: string;
    secretKeyEnv: string;
    bucketEnv: string;
    useSslEnv?: string;
  };
  /** Parameterized SQL only ($1, $2, ...) — never string-interpolated with user input. */
  query: string;
  /**
   * Phase 05 addition: point-lookup query (parameterized, `$1` = a single
   * stable row id) used by the image proxy to re-resolve `{bucket,
   * objectKey, mimeType}` server-side from a `recordId` the client can only
   * have received from a prior authorized `query` result — never accepted
   * as a raw bucket/objectKey (reference-database-erd.md Unresolved
   * Questions: "does the image DB expose a stable per-photo id?" — yes,
   * `citizen_photos.id`).
   */
  recordQuery?: string;
  timeoutMs?: number;
}

export type TransportConfig = TransportHttp | TransportMock | TransportMinioPg;

export interface DatasourceInput {
  fields: InputFieldDef[];
  /** At least one of these input field names must be present/non-empty. */
  atLeastOneOf?: string[];
  /**
   * OR-of-AND-groups: at least one group's fields must ALL be present/non-empty.
   * E.g. `[["soHC"], ["hoTen","ngaySinh","gioiTinh"]]` = "passport number,
   * OR full name + DOB + gender all together" (checking-api immigration/
   * passport lookup rule). Independent of `atLeastOneOf`; a datasource may use
   * either, both, or neither.
   */
  requireGroups?: string[][];
}

export interface DatasourceOutput {
  /** Path to the records array in the raw upstream JSON (http adapter only). */
  recordsPath?: string;
  totalPath?: string;
  requestIdPath?: string;
  /** Which mapped output field name is the timeline sort key. */
  timestampField: string;
  sortOrder: 'asc' | 'desc';
  /** Which mapped output field name groups records into a per-identity timeline. */
  identityField: string;
  imageRef?: {
    bucketField: string;
    objectKeyField: string;
    mimeField: string;
  };
  fields: OutputFieldDef[];
}

export interface DatasourceLimits {
  maxResults: number;
  pageSize: number;
}

export interface DatasourceEntry {
  code: string;
  name: string;
  description?: string;
  type: 'info' | 'image';
  enabled: boolean;
  permissionCode: string;
  transport: TransportConfig;
  input: DatasourceInput;
  output: DatasourceOutput;
  limits?: DatasourceLimits;
}

export interface ConfigDefaults {
  maxResults: number;
  pageSize: number;
  timeoutMs: number;
  retry: TransportRetry;
}

export interface DatasourceConfigFile {
  version: 1;
  defaults: ConfigDefaults;
  datasources: DatasourceEntry[];
}

/** Backward-compat alias — see health.controller.ts / apps/web/src/App.tsx (Phase 01 smoke checks). */
export type DatasourceConfig = DatasourceEntry;

// ---------------------------------------------------------------------------
// Client (redacted) projection — served by GET /api/v1/datasources[/:code]
// ---------------------------------------------------------------------------

export type ClientInputField = InputFieldDef;

/** Output field client projection: never `from` (upstream key) — everything else is safe. */
export type ClientOutputField = Omit<OutputFieldDef, 'from'>;

export interface ClientDatasource {
  code: string;
  name: string;
  description?: string;
  type: 'info' | 'image';
  input: DatasourceInput;
  output: {
    fields: ClientOutputField[];
  };
  limits: DatasourceLimits;
}
