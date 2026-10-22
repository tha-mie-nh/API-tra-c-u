import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { generateTempPassword } from '../src/users/temp-password.util';

/** One-off emergency reset for a locked-out admin — same temp-password shape
 * as `UsersService.resetPassword`, run directly against the DB since the
 * self-service flow requires an admin to approve, which is unavailable when
 * the admin themself is locked out. */
async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error('Usage: ts-node scripts/reset-admin-password.ts <username>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`User "${username}" not found`);
    process.exit(1);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: true, status: 'ACTIVE', lockedUntil: null, failedLoginCount: 0 },
  });
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  console.log(`username: ${username}`);
  console.log(`tempPassword: ${tempPassword}`);
  await prisma.$disconnect();
}

main();
