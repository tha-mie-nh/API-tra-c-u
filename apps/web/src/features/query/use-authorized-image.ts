import { useEffect, useState } from 'react';
import { apiFetchImageBlob } from '@/lib/api-client';

interface AuthorizedImageState {
  url: string | null;
  isLoading: boolean;
  error: boolean;
}

/**
 * Loads a backend-authenticated image (`GET /query/:code/image/:recordId[/thumb]`)
 * as an object URL. A plain `<img src>` cannot carry the in-memory Bearer
 * access token (lib/auth-store.ts), so every photo fetch goes through
 * `apiFetchImageBlob` (same auth + single-flight-refresh semantics as
 * `apiFetch`) and is exposed to `<img>` via `URL.createObjectURL` — images
 * are never loaded from a raw MinIO URL (reference-config-schema.md Security
 * Considerations). Pass `path=null` to skip loading (used for lazy-loading).
 */
export function useAuthorizedImage(path: string | null): AuthorizedImageState {
  const [state, setState] = useState<AuthorizedImageState>({ url: null, isLoading: !!path, error: false });

  useEffect(() => {
    if (!path) {
      setState({ url: null, isLoading: false, error: false });
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ url: null, isLoading: true, error: false });

    apiFetchImageBlob(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, isLoading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, isLoading: false, error: true });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return state;
}
