import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus, type User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService, type RequestMeta } from './token.service';
import type { LoginDto } from './dto/login.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';

export interface SessionResult {
  accessToken: string;
  expiresIn: number;
  refreshRawToken: string;
  user: User;
}

// Verified (and discarded) on every login attempt for a username that
// doesn't exist, so a non-existent-user login takes roughly the same time as
// a wrong-password one — mitigates username enumeration via response timing
// (see phase-03 Security Considerations).
let cachedDummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (!cachedDummyHash) {
    cachedDummyHash = await argon2.hash('dummy-password-for-timing-normalization', {
      type: argon2.argon2id,
    });
  }
  return cachedDummyHash;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto, meta: RequestMeta): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    const hashToVerify = user?.passwordHash ?? (await getDummyHash());
    const passwordValid = await argon2.verify(hashToVerify, dto.password).catch(() => false);

    if (!user) {
      // Same generic message/code as "wrong password" — never reveal
      // whether the username exists.
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    }

    const now = new Date();
    if (user.status === UserStatus.DISABLED) {
      throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Account is disabled' });
    }
    if (user.status === UserStatus.LOCKED || (user.lockedUntil && user.lockedUntil > now)) {
      throw new UnauthorizedException({ code: 'ACCOUNT_LOCKED', message: 'Account is locked' });
    }

    if (!passwordValid) {
      await this.registerFailedLogin(user);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });

    return this.issueSession({ id: user.id, username: user.username }, meta);
  }

  private async registerFailedLogin(user: User): Promise<void> {
    const maxAttempts = Number(this.configService.get<string>('AUTH_LOGIN_MAX_ATTEMPTS') ?? 5);
    const lockoutMinutes = Number(this.configService.get<string>('AUTH_LOCKOUT_MINUTES') ?? 15);
    const nextCount = user.failedLoginCount + 1;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: nextCount,
        ...(nextCount >= maxAttempts
          ? { lockedUntil: new Date(Date.now() + lockoutMinutes * 60_000) }
          : {}),
      },
    });
  }

  async refresh(rawToken: string, meta: RequestMeta): Promise<SessionResult> {
    const { userId, newRawToken } = await this.tokenService.rotateRefreshToken(rawToken, meta);

    // Re-read status on every refresh — this is the lock-propagation
    // mechanism: an admin lock takes effect at the user's next refresh.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const now = new Date();
    if (!user || user.status !== UserStatus.ACTIVE || (user.lockedUntil && user.lockedUntil > now)) {
      await this.tokenService.revokeAllForUser(userId);
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session is no longer valid' });
    }

    const access = this.tokenService.signAccessToken({ id: user.id, username: user.username });
    return { accessToken: access.token, expiresIn: access.expiresInSeconds, refreshRawToken: newRawToken, user };
  }

  async logout(rawToken: string): Promise<void> {
    await this.tokenService.revoke(rawToken);
  }

  /**
   * When `mustChangePassword` is set (forced first-login / post-reset flow),
   * the current-password check is skipped: the user already proved identity
   * by logging in with the temp password in this same session, so re-typing
   * it adds no security value here (still requires a valid access token).
   * Otherwise the current password must match.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    currentRawRefreshToken?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.mustChangePassword) {
      const valid = await argon2.verify(user.passwordHash, dto.currentPassword ?? '').catch(() => false);
      if (!valid) {
        throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' });
      }
    }

    const newHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, mustChangePassword: false },
    });
    await this.tokenService.revokeAllForUser(userId, currentRawRefreshToken);
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
  }

  /**
   * Self-service "forgot password" (no email flow, see login page comment):
   * records a pending request for an admin to approve/reject. Always
   * resolves silently regardless of whether the username exists, is
   * disabled, or already has a pending request — the controller returns the
   * same generic response either way, so this never reveals account
   * existence (same anti-enumeration principle as `login`).
   */
  async requestPasswordReset(username: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || user.status === UserStatus.DISABLED) return;

    const existingPending = await this.prisma.passwordResetRequest.findFirst({
      where: { userId: user.id, status: 'PENDING' },
    });
    if (existingPending) return;

    await this.prisma.passwordResetRequest.create({
      data: { userId: user.id, usernameSnapshot: user.username, requestIp: meta.ip ?? null },
    });
  }

  private async issueSession(
    user: { id: string; username: string },
    meta: RequestMeta,
  ): Promise<SessionResult> {
    const access = this.tokenService.signAccessToken(user);
    const refreshRawToken = await this.tokenService.issueRefreshToken(user.id, meta);
    const fullUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return { accessToken: access.token, expiresIn: access.expiresInSeconds, refreshRawToken, user: fullUser };
  }
}
