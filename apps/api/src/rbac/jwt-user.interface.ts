/** Shape of `request.user`, set by JwtStrategy.validate() and enriched with
 * `permissions` by PermissionGuard once it resolves the effective set. */
export interface JwtUser {
  id: string;
  username: string;
  permissions?: string[];
}
