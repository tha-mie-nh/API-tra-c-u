import { randomBytes, createHash } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { parseDurationMs } from '../common/utils/parse-duration.util';

export interface AccessTokenUser {
  id: string;
  username: string;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/**
 * Issues/rotates/revokes both halves of a session: the access JWT (signed,
 * stateless, 15min) and the refresh token (opaque random 32 bytes, SHA-256
 * hash stored in `refresh_tokens`, raw value never touches the DB).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get refreshTtlMs(): number {
    return parseDurationMs(this.configService.get<string>('JWT_REFRESH_TTL') ?? '7d');
  }

  signAccessToken(user: AccessTokenUser): { token: string; expiresInSeconds: number } {
    const ttl = this.configService.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const token = this.jwtService.sign(
      { sub: user.id, username: user.username },
      { expiresIn: ttl as JwtSignOptions['expiresIn'] },
    );
    return { token, expiresInSeconds: Math.floor(parseDurationMs(ttl) / 1000) };
  }

  private hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  async issueRefreshToken(userId: string, meta: RequestMeta = {}): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(rawToken),
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return rawToken;
  }

  /**
   * Rotates a refresh token: validates it, revokes the old row, issues a
   * fresh one. Reuse of an ALREADY-REVOKED token is treated as a theft
   * signal (per Risk Assessment) — the whole token family for that user is
   * revoked and the caller must re-login.
   */
  async rotateRefreshToken(
    rawToken: string,
    meta: RequestMeta = {},
  ): Promise<{ userId: string; newRawToken: string }> {
    const tokenHash = this.hash(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid refresh token' });
    }
    if (existing.revokedAt) {
      await this.revokeAllForUser(existing.userId);
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Refresh token reuse detected, all sessions revoked',
      });
    }
    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Refresh token expired' });
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    const newRawToken = await this.issueRefreshToken(existing.userId, meta);
    return { userId: existing.userId, newRawToken };
  }

  async revoke(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every active refresh token for a user, optionally sparing one
   * (used by change-password, which keeps the current session alive). */
  async revokeAllForUser(userId: string, exceptRawToken?: string): Promise<void> {
    const exceptHash = exceptRawToken ? this.hash(exceptRawToken) : undefined;
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptHash ? { tokenHash: { not: exceptHash } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }
}
