import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/app-config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { AuditModule } from './audit/audit.module';
import { DatasourcesModule } from './datasources/datasources.module';
import { AdminDatasourcesModule } from './admin-datasources/admin-datasources.module';
import { QueryModule } from './query/query.module';
import { HistoryModule } from './history/history.module';
import { JwtAuthGuard } from './rbac/jwt-auth.guard';
import { PermissionGuard } from './rbac/permission.guard';
import { AuditInterceptor } from './audit/audit.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    // Named throttlers: 'default' (generous, app-wide safety net, unused
    // unless a route opts in via @UseGuards(ThrottlerGuard)), 'login'
    // (tighter, env-configurable — only POST /auth/login opts in), and
    // 'query' (phase-05 per-user query rate limit — POST /query/:code opts
    // in via QueryThrottlerGuard + @SkipThrottle({default:true,login:true})
    // so only this named limit applies there). Named throttlers are checked
    // automatically for any route guarded by (a subclass of) ThrottlerGuard.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { name: 'default', ttl: 60_000, limit: 100 },
        {
          name: 'login',
          ttl: Number(config.get<string>('LOGIN_THROTTLE_TTL_MS') ?? '60000'),
          limit: Number(config.get<string>('LOGIN_THROTTLE_LIMIT') ?? '10'),
        },
        {
          name: 'query',
          ttl: Number(config.get<string>('QUERY_THROTTLE_TTL_MS') ?? '60000'),
          limit: Number(config.get<string>('QUERY_THROTTLE_LIMIT') ?? '30'),
        },
      ],
    }),
    HealthModule,
    RbacModule,
    AuthModule,
    UsersModule,
    RolesModule,
    AuditModule,
    DatasourcesModule,
    AdminDatasourcesModule,
    HistoryModule,
    QueryModule,
  ],
  providers: [
    // Order matters: authenticate first, then authorize.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Phase 05 non-functional requirement: "X-Request-Id on every response
    // and in every log row" — applied before any guard/controller runs.
    // Express 5 / path-to-regexp v8 (NestJS 11) dropped the bare '*'
    // wildcard — NestJS auto-converts it at boot (LegacyRouteConverter
    // warning) but that runtime conversion mis-registers nested paths (e.g.
    // GET /api/v1/health/ready 404'd while /api/v1/health did not, found by
    // actually running the built image and curling it — no test exercised
    // the real HTTP route, only the controller method directly). Using the
    // modern named-wildcard syntax directly sidesteps the broken conversion.
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
