import type { JwtUser } from './jwt-user.interface';

// @types/passport declares an (intentionally empty) `Express.User` interface
// specifically so consumers augment it via declaration merging — this is
// the canonical way to type `request.user` without conflicting with
// passport's own `Request.user?: User` declaration. Re-declaring
// `Request.user` directly (instead of extending `Express.User`) would
// collide with passport's declaration.
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional declaration-merging idiom, not an empty type
    interface User extends JwtUser {}
    interface Request {
      auditBefore?: unknown;
      /** Extra fields merged into audit `after` for capture:'request' (e.g. CSV row count). */
      auditExtra?: Record<string, unknown>;
    }
  }
}

export {};
