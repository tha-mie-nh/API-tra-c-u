import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Regression test for a real prod incident: an ADMIN locked their own
 * account while testing the lock/unlock feature, which revoked their own
 * session with no other admin left to undo it (recovered only via a direct
 * DB update). `lock()` must hard-block both that case and the equivalent
 * "lock the last remaining active ADMIN" case.
 */
describe('UsersService.lock', () => {
  const nonAdminUser = { id: 'user-1', username: 'someone', userRoles: [] };
  const adminUser = { id: 'admin-1', username: 'admin', userRoles: [{ role: { code: 'ADMIN' } }] };

  function makeService(options: { findUniqueResult?: unknown; activeAdminCount?: number } = {}) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(options.findUniqueResult ?? nonAdminUser),
        update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          ...(options.findUniqueResult ?? nonAdminUser),
          ...data,
        })),
        count: jest.fn().mockResolvedValue(options.activeAdminCount ?? 0),
      },
    };
    const tokenService = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };
    const service = new UsersService(prisma as never, tokenService as never);
    return { service, prisma, tokenService };
  }

  it('rejects an actor trying to lock their own account, without touching the DB', async () => {
    const { service, prisma } = makeService();

    await expect(service.lock('actor-1', 'actor-1')).rejects.toThrow(ConflictException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects locking the only remaining active ADMIN account', async () => {
    const { service, prisma } = makeService({ findUniqueResult: adminUser, activeAdminCount: 1 });

    await expect(service.lock('admin-1', 'actor-1')).rejects.toThrow(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows locking an ADMIN when another active ADMIN still exists', async () => {
    const { service, prisma } = makeService({ findUniqueResult: adminUser, activeAdminCount: 2 });

    await expect(service.lock('admin-1', 'actor-1')).resolves.toBeDefined();
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('allows locking a non-admin user by a different actor', async () => {
    const { service, prisma, tokenService } = makeService({ findUniqueResult: nonAdminUser });

    await service.lock('user-1', 'actor-1');

    expect(prisma.user.update).toHaveBeenCalled();
    expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });
});

/**
 * Both `setRoles` and `delete` previously had NO self-protection at all —
 * an ADMIN could remove their own Administrator role, or (once `delete`
 * was added) their own account, with the UI's "last admin" warning text
 * implying a backend guard that didn't actually exist. Added after a user
 * caught this live: "admin có thể tự bỏ role admin của mình".
 */
describe('UsersService.setRoles / delete', () => {
  const nonAdminUser = { id: 'user-1', username: 'someone', userRoles: [] };
  const adminUser = { id: 'admin-1', username: 'admin', userRoles: [{ role: { code: 'ADMIN' } }] };
  const ADMIN_ROLE_ID = 'role-admin';

  function makeService(options: { findUniqueResult?: unknown; activeAdminCount?: number; adminRoleExists?: boolean } = {}) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(options.findUniqueResult ?? nonAdminUser),
        update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          ...(options.findUniqueResult ?? nonAdminUser),
          ...data,
        })),
        count: jest.fn().mockResolvedValue(options.activeAdminCount ?? 0),
      },
      role: {
        findFirst: jest.fn().mockResolvedValue(options.adminRoleExists ? { id: ADMIN_ROLE_ID, code: 'ADMIN' } : null),
      },
      userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    const tokenService = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };
    const service = new UsersService(prisma as never, tokenService as never);
    return { service, prisma, tokenService };
  }

  it('rejects an actor changing their own roles, without touching the DB', async () => {
    const { service, prisma } = makeService();

    await expect(service.setRoles('actor-1', [], 'actor-1')).rejects.toThrow(ConflictException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects removing ADMIN from the only remaining active admin', async () => {
    const { service, prisma } = makeService({ findUniqueResult: adminUser, activeAdminCount: 1, adminRoleExists: false });

    await expect(service.setRoles('admin-1', ['role-auditor'], 'actor-1')).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows removing ADMIN from a target when another active admin still exists', async () => {
    const { service, prisma } = makeService({ findUniqueResult: adminUser, activeAdminCount: 2, adminRoleExists: false });

    await service.setRoles('admin-1', ['role-auditor'], 'actor-1');

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('allows a normal role change for a non-admin target by a different actor', async () => {
    const { service, prisma } = makeService({ findUniqueResult: nonAdminUser });

    await service.setRoles('user-1', ['role-auditor'], 'actor-1');

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects an actor deleting their own account, without touching the DB', async () => {
    const { service, prisma } = makeService();

    await expect(service.delete('actor-1', 'actor-1')).rejects.toThrow(ConflictException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects deleting any account that holds the ADMIN role', async () => {
    const { service, prisma } = makeService({ findUniqueResult: adminUser });

    await expect(service.delete('admin-1', 'actor-1')).rejects.toThrow(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('soft-deletes (DISABLED + session revoke) a non-admin account', async () => {
    const { service, prisma, tokenService } = makeService({ findUniqueResult: nonAdminUser });

    const result = await service.delete('user-1', 'actor-1');

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DISABLED' }) }));
    expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(result.status).toBe('DISABLED');
  });
});
