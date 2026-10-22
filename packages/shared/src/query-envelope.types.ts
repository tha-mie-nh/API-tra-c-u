/**
 * Phase 04 — the unified response envelope produced by `ResponseMapperService`
 * and (Phase 05) returned by `POST /api/v1/query/:code`. Identical shape for
 * every datasource — this is what lets the frontend render generically. See
 * plans/260920-2200-app-tra-cuu-du-lieu/reference-config-schema.md
 * "Unified response envelope".
 */
import type { FieldType } from './datasource-config.types';

export interface QueryColumn {
  name: string;
  label: string;
  type: FieldType;
  emphasize?: boolean;
  iconMap?: Record<string, string>;
  headerField?: boolean;
}

/** One mapped output record — keys are output field `name`s, not upstream keys. */
export type QueryRecord = Record<string, unknown>;

export interface QueryRecordGroup {
  /** Value of the datasource's `identityField` for this group (e.g. a CCCD). */
  identity: string;
  /** Human-friendly label for the group (best-effort; see ResponseMapperService). */
  label: string;
  /** Sorted by the datasource's `timestampField`/`sortOrder`. */
  records: QueryRecord[];
}

export interface QueryPage {
  page: number;
  pageSize: number;
  total: number;
  returned: number;
  limit: number;
  truncated: boolean;
}

export interface QueryEnvelope {
  datasource: string;
  type: 'info' | 'image';
  requestId: string;
  columns: QueryColumn[];
  timestampField: string;
  groups: QueryRecordGroup[];
  page: QueryPage;
  tookMs: number;
}

/** Phase 05 — request body of `POST /api/v1/query/:code` (reference-api-specification.md). */
export interface QueryRequestBody {
  params: Record<string, unknown>;
  page?: number;
  pageSize?: number;
}
