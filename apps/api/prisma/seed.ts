/**
 * Idempotent DB seed (Phase 02): feature permissions, 3 baseline roles,
 * one bootstrap admin user. Safe to re-run (upsert only, never inserts
 * duplicates). See plans/260920-2200-app-tra-cuu-du-lieu/phase-02-database-schema-and-migrations.md
 *
 * Run via `pnpm --filter api run db:seed` (loads root .env through dotenv-cli).
 */
import { PrismaClient, PermissionKind } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Kept as inline literals (not imported from @app/shared) because this script
// runs under ts-node with a relaxed CommonJS config — see permission-codes.ts
// in packages/shared for the canonical source these values must match.
const FEATURE_PERMISSIONS = [
  { code: 'history:view_own', name: 'View own query history' },
  { code: 'history:view_all', name: 'View all users query history' },
  // Review feedback: history's lookup identifier (CCCD/passport/...) should
  // show in full for ADMIN, masked for everyone else. Not granted to
  // OPERATOR/AUDITOR below — only ADMIN gets every feature permission
  // automatically (see seedRoles).
  { code: 'history:view_sensitive', name: 'View unmasked sensitive values in query history' },
  // Bulk CSV export of query history — ADMIN only (auto-granted below); not given to OPERATOR/AUDITOR.
  { code: 'history:export', name: 'Export query history (CSV)' },
  { code: 'admin:users', name: 'Manage users' },
  { code: 'admin:roles', name: 'Manage roles' },
  { code: 'admin:audit', name: 'View audit log' },
  { code: 'admin:datasources', name: 'Manage datasources' },
  { code: 'admin:query_stats', name: 'View query statistics dashboard' },
] as const;

const BOOTSTRAP_ADMIN_USERNAME = 'admin';

async function seedFeaturePermissions() {
  const permissions = [];
  for (const perm of FEATURE_PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, kind: PermissionKind.FEATURE },
      create: { code: perm.code, name: perm.name, kind: PermissionKind.FEATURE },
    });
    permissions.push(row);
  }
  return permissions;
}

async function seedRoles(allFeaturePermissionIds: string[]) {
  const admin = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: { name: 'Administrator', isSystem: true },
    create: {
      code: 'ADMIN',
      name: 'Administrator',
      description: 'Full system access: user/role/audit management + all API permissions.',
      isSystem: true,
    },
  });

  const operator = await prisma.role.upsert({
    where: { code: 'OPERATOR' },
    update: { name: 'Operator' },
    create: {
      code: 'OPERATOR',
      name: 'Operator',
      description: 'Runs lookups, views own query history.',
      isSystem: false,
    },
  });

  const auditor = await prisma.role.upsert({
    where: { code: 'AUDITOR' },
    update: { name: 'Auditor' },
    create: {
      code: 'AUDITOR',
      name: 'Auditor',
      description: 'Read-only visibility into every user query history (no API access).',
      isSystem: false,
    },
  });

  // ADMIN gets every FEATURE permission plus every already-synced API
  // (datasource) permission. The latter only exist once the api has booted
  // at least once (PermissionSyncService upserts `kind: API` rows from
  // config.json at startup — see permission-sync.service.ts) — it does NOT
  // grant them to any role, only creates the Permission rows. Re-running
  // this seed (idempotent, see deployment-guide.md) after every api restart
  // picks up any newly-added datasources' permissions. Found by an actual
  // end-to-end prod-stack run: without this, GET /datasources returned []
  // for the bootstrap admin even with datasources configured and enabled.
  const apiPermissions = await prisma.permission.findMany({ where: { kind: PermissionKind.API } });
  await grantPermissions(
    admin.id,
    [...allFeaturePermissionIds, ...apiPermissions.map((p) => p.id)],
  );

  const operatorPerm = await prisma.permission.findUniqueOrThrow({
    where: { code: 'history:view_own' },
  });
  await grantPermissions(operator.id, [operatorPerm.id]);

  const auditorPerm = await prisma.permission.findUniqueOrThrow({
    where: { code: 'history:view_all' },
  });
  await grantPermissions(auditor.id, [auditorPerm.id]);

  return { admin, operator, auditor };
}

async function grantPermissions(roleId: string, permissionIds: string[]) {
  for (const permissionId of permissionIds) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: {},
      create: { roleId, permissionId },
    });
  }
}

async function seedBootstrapAdmin(adminRoleId: string) {
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      'BOOTSTRAP_ADMIN_PASSWORD env var is not set. Refusing to seed a default password — set it in .env first.',
    );
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL ?? null;

  // BOOTSTRAP_ADMIN_PASSWORD is the INITIAL password only. Until the admin has
  // logged in successfully once (lastLoginAt === null) the env value stays
  // authoritative, so fixing a wrong/typo'd value and re-running seed takes
  // effect (previously `update: {}` silently kept the first hash, making
  // "I changed BOOTSTRAP_ADMIN_PASSWORD but can't log in" the #1 first-deploy
  // trap). After the first successful login the password belongs to the user
  // and re-seeding never touches it (incl. temp passwords from a reset).
  const existing = await prisma.user.findUnique({ where: { username: BOOTSTRAP_ADMIN_USERNAME } });
  let admin = existing;
  let outcome: BootstrapAdminOutcome = 'kept';

  if (!existing) {
    admin = await prisma.user.create({
      data: {
        username: BOOTSTRAP_ADMIN_USERNAME,
        email,
        fullName: 'System Administrator',
        passwordHash,
        mustChangePassword: true,
      },
    });
    outcome = 'created';
  } else if (existing.lastLoginAt === null) {
    const alreadyMatches = await argon2.verify(existing.passwordHash, password).catch(() => false);
    if (!alreadyMatches) {
      admin = await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, mustChangePassword: true, status: 'ACTIVE', lockedUntil: null, failedLoginCount: 0 },
      });
      outcome = 'synced-from-env';
    }
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin!.id, roleId: adminRoleId } },
    update: {},
    create: { userId: admin!.id, roleId: adminRoleId },
  });

  return { admin: admin!, outcome };
}

type BootstrapAdminOutcome = 'created' | 'synced-from-env' | 'kept';

const OUTCOME_MESSAGE: Record<BootstrapAdminOutcome, string> = {
  created: 'created with BOOTSTRAP_ADMIN_PASSWORD (must change password on first login)',
  'synced-from-env': 'password re-synced from BOOTSTRAP_ADMIN_PASSWORD (admin never logged in yet)',
  kept: 'kept as is — admin already logged in / already matches env, password NOT overwritten',
};

async function main() {
  const permissions = await seedFeaturePermissions();
  const { admin } = await seedRoles(permissions.map((p) => p.id));
  const { admin: adminUser, outcome } = await seedBootstrapAdmin(admin.id);

  console.log(`Seed complete. Feature permissions: ${permissions.length}.`);
  console.log(`Bootstrap admin "${adminUser.username}": ${OUTCOME_MESSAGE[outcome]}.`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
