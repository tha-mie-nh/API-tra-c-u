import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { generateTempPassword } from '../src/users/temp-password.util';

/** One-off: create a fresh user with the ADMIN role — same use case as
 * `reset-admin-password.ts` (bootstrap without going through the self-service
 * UI, which itself needs an admin to be usable), but for handing out a
 * SEPARATE account (e.g. to a reviewer) instead of sharing/resetting an
 * existing one. Idempotent: re-running for the same username just re-mints a
 * temp password for that user (never silently creates a duplicate). */
async function main() {
  const username = process.argv[2];
  const fullName = process.argv[3];
  if (!username || !fullName) {
    console.error('Usage: ts-node scripts/create-admin-user.ts <username> <"Full Name">');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
  if (!adminRole) {
    console.error('ADMIN role not found — run the DB seed first (pnpm --filter api run db:seed).');
    process.exit(1);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { username },
    update: { passwordHash, mustChangePassword: true, status: 'ACTIVE', lockedUntil: null, failedLoginCount: 0 },
    create: { username, fullName, passwordHash, mustChangePassword: true },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });

  console.log(`username: ${username}`);
  console.log(`tempPassword: ${tempPassword}`);
  await prisma.$disconnect();
}

main();
