/**
 * Auth response shapes shared between `apps/api` (AuthController) and
 * `apps/web` (Phase 06 login flow). See reference-api-specification.md
 * "Auth" section.
 */

/** GET /auth/me response — profile + effective permission codes (union over the user's roles). */
export interface MeResponse {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  mustChangePassword: boolean;
  permissions: string[];
  /** Display names (`roles.name`, e.g. "Administrator") of every role
   * assigned to this user — shown on the home page (review feedback:
   * "trang chủ thể hiện thông tin cá nhân"). Not used for any permission
   * decision (that's `permissions`, resolved server-side). */
  roles: string[];
}

/** POST /auth/login and POST /auth/refresh response body. The refresh token
 * itself never appears here — it is only ever set as an httpOnly cookie. */
export interface LoginResponse {
  accessToken: string;
  /** Access token TTL in seconds, so the FE can schedule a proactive refresh. */
  expiresIn: number;
  user: {
    id: string;
    username: string;
    fullName: string;
    email: string | null;
    mustChangePassword: boolean;
  };
}
