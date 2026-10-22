import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtUser } from '../rbac/jwt-user.interface';

interface AccessTokenPayload {
  sub: string;
  username: string;
}

/** Validates the `Authorization: Bearer <accessToken>` header. Only ever
 * reads the access token (in-memory on the FE) — the refresh cookie is
 * handled separately/manually in AuthController, never via passport. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: AccessTokenPayload): JwtUser {
    return { id: payload.sub, username: payload.username };
  }
}
