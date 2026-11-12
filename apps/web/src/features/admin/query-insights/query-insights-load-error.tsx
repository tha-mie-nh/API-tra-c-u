import { ApiError } from '@/lib/api-client';
import { vi } from '@/i18n/vi';

const t = vi.admin.queryInsights;

/** 422 = invalid range (>90 days), 404 = unknown user/IP; anything else = generic. */
export function QueryInsightsLoadError({ error }: { error: unknown }) {
  const status = error instanceof ApiError ? error.status : 0;
  const text = status === 422 ? t.err422 : status === 404 ? t.err404 : t.loadError;
  return (
    <p role="alert" className="text-destructive text-sm">
      {text}
    </p>
  );
}
