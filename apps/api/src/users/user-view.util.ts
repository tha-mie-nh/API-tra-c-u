import type { Role, User, UserRole } from '@prisma/client';

/** Minimal role projection embedded on a user row for the admin UI (Phase 08
 * AssignRolesDialog needs to know the CURRENT set to pre-select it — the
 * dialog does a full replace via `PUT /admin/users/:id/roles`, so showing a
 * blank list would silently drop existing grants on save). */
export type PublicUserRole = Pick<Role, 'id' | 'code' | 'name'>;

export type PublicUser = Omit<User, 'passwordHash'> & {
  /** Present only when the caller (`UsersService`) eager-loaded `userRoles.role`. */
  roles?: PublicUserRole[];
};

type UserWithOptionalRoles = User & { userRoles?: (UserRole & { role: Role })[] };

/** Strips `passwordHash` before a user row ever leaves the service layer.
 * Additive-only: `roles` is only populated when the caller included
 * `userRoles.role` in the Prisma query — omitting it does not change any
 * existing field of the response. */
export function toPublicUser(user: UserWithOptionalRoles): PublicUser {
  const { passwordHash: _passwordHash, userRoles, ...rest } = user;
  return {
    ...rest,
    ...(userRoles ? { roles: userRoles.map(({ role }) => ({ id: role.id, code: role.code, name: role.name })) } : {}),
  };
}
