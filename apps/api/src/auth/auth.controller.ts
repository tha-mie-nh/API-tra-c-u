import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import type { LoginResponse, MeResponse } from '@app/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Public } from '../rbac/public.decorator';
import { RequirePermission } from '../rbac/permission.decorator';
import { CurrentUser } from '../rbac/current-user.decorator';
import type { JwtUser } from '../rbac/jwt-user.interface';
import { PermissionResolverService } from '../rbac/permission-resolver.service';
import { AuthService } from './auth.service';
import { loginSchema, type LoginDto } from './dto/login.dto';
import { changePasswordSchema, type ChangePasswordDto } from './dto/change-password.dto';
import { forgotPasswordSchema, type ForgotPasswordDto } from './dto/forgot-password.dto';
import { REFRESH_COOKIE_NAME, setRefreshCookie, clearRefreshCookie } from './cookie.util';

@Controller('auth')
@ApiTags('Auth')
@ApiBearerAuth('access-token')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  // Rate limits per the 'default' + 'login' named throttlers registered in
  // AppModule ('login' is the tight, env-configurable one for this route).
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.login(body, this.requestMeta(req));
    setRefreshCookie(res, result.refreshRawToken, this.configService);
    return this.toLoginResponse(result.user, result.accessToken, result.expiresIn);
  }

  /**
   * Self-service "forgot password" (no email — admin approves via
   * /admin/users/password-reset-requests). Same generic response and same
   * rate-limit guard as `login` — never reveals whether `username` exists.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordDto,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.authService.requestPasswordReset(body.username, this.requestMeta(req));
    return { success: true };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!rawToken) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Missing refresh token' });
    }
    const result = await this.authService.refresh(rawToken, this.requestMeta(req));
    setRefreshCookie(res, result.refreshRawToken, this.configService);
    return this.toLoginResponse(result.user, result.accessToken, result.expiresIn);
  }

  @RequirePermission()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ success: true }> {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (rawToken) await this.authService.logout(rawToken);
    clearRefreshCookie(res, this.configService);
    return { success: true };
  }

  @RequirePermission()
  @Get('me')
  async me(@CurrentUser() currentUser: JwtUser): Promise<MeResponse> {
    const [profile, permissions] = await Promise.all([
      this.authService.getProfile(currentUser.id),
      this.permissionResolver.getEffectivePermissions(currentUser.id),
    ]);
    return this.toMeResponse(profile, permissions);
  }

  @RequirePermission()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() currentUser: JwtUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    await this.authService.changePassword(currentUser.id, body, rawToken);
    return { success: true };
  }

  private requestMeta(req: Request) {
    return { ip: req.ip, userAgent: req.get('user-agent') ?? undefined };
  }

  private toLoginResponse(user: User, accessToken: string, expiresIn: number): LoginResponse {
    return {
      accessToken,
      expiresIn,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  private toMeResponse(
    user: Awaited<ReturnType<AuthService['getProfile']>>,
    permissions: Set<string>,
  ): MeResponse {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
      permissions: Array.from(permissions),
      roles: user.userRoles.map((ur) => ur.role.name),
    };
  }
}
