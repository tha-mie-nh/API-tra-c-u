import type { Response } from 'express';
import type { ConfigService } from '@nestjs/config';
import { parseDurationMs } from '../common/utils/parse-duration.util';

export const REFRESH_COOKIE_NAME = 'refresh_token';
// Scoped to /api/v1/auth only: the refresh cookie is never needed outside
// login/refresh/logout/change-password, so the browser never attaches it to
// any other request (defense in depth).
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * `secure` is tied to `COOKIE_SECURE`, NOT `NODE_ENV` — a browser silently
 * refuses to ever store/send a `Secure` cookie over plain HTTP, so this must
 * reflect whether TLS is ACTUALLY terminated in front of this deploy, not
 * just "is this prod" (prod briefly ran behind Caddy's self-signed TLS;
 * after removing Caddy, prod is plain HTTP again until an external proxy
 * adds TLS — flip this one env var back to `true` then, no code change).
 * Defaults to `NODE_ENV === 'production'` for back-compat when unset.
 */
function cookieOptions(configService: ConfigService) {
  const cookieSecure = configService.get<string>('COOKIE_SECURE');
  const secure = cookieSecure !== undefined ? cookieSecure === 'true' : configService.get<string>('NODE_ENV') === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(res: Response, rawToken: string, configService: ConfigService): void {
  const maxAge = parseDurationMs(configService.get<string>('JWT_REFRESH_TTL') ?? '7d');
  res.cookie(REFRESH_COOKIE_NAME, rawToken, { ...cookieOptions(configService), maxAge });
}

export function clearRefreshCookie(res: Response, configService: ConfigService): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions(configService));
}
