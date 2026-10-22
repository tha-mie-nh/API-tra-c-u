import type { UseFormSetError, FieldValues, Path } from 'react-hook-form';
import { ApiError } from '@/lib/api-client';
import { vi } from '@/i18n/vi';

/** Maps a `POST /query/:code` failure to a Vietnamese message for
 * `ResultStates`'s error state (phase-07 Implementation Step 12: 422 is
 * handled separately via `applyServerFieldErrors`, everything else lands
 * here — validation errors that don't carry field details also fall back to
 * this generic message). */
export function queryErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return vi.query.errorRateLimited;
    switch (error.code) {
      case 'VALIDATION_ERROR':
        return vi.query.errorValidation;
      case 'FORBIDDEN_API':
      case 'DATASOURCE_NOT_FOUND':
        return vi.query.errorForbidden;
      case 'UPSTREAM_TIMEOUT':
      case 'UPSTREAM_ERROR':
        return vi.query.errorUpstream;
      default:
        break;
    }
    if (error.status === 403) return vi.query.errorForbidden;
    if (error.status === 502 || error.status === 504) return vi.query.errorUpstream;
  }
  return vi.query.errorGeneric;
}

/** 422 `error.details[]` -> RHF field errors, so a backend validation
 * failure highlights the same fields the client-side zod schema would have
 * (phase-07 Implementation Step 12). Returns `true` if it applied at least
 * one field error (caller then skips the generic error banner). */
export function applyServerFieldErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR' || !error.details?.length) return false;
  for (const detail of error.details) {
    if (!detail.path) continue;
    setError(detail.path as Path<T>, { type: 'server', message: detail.message });
  }
  return true;
}
