/**
 * Minimal fail-fast env validation run at boot by @nestjs/config.
 * Phase 01 only checked server port + config file path. Phase 03 adds the
 * JWT secrets (required — auth cannot start without them); TTLs and
 * lockout thresholds keep sane defaults so local dev works without every
 * var being set explicitly.
 *
 * IMPORTANT: `@nestjs/config` uses this function's return value as the
 * full source of truth for `process.env`/`ConfigService` once a custom
 * `validate` is supplied — any key NOT included in the returned object
 * effectively disappears (confirmed empirically: DATABASE_URL, POSTGRES_*,
 * MinIO/upstream vars owned by other phases were silently dropped before
 * this fix, breaking `PrismaService.$connect()` in every e2e test). So this
 * must always spread the full parsed `config`, only overlaying the
 * documented/defaulted subset below.
 */
export interface EnvSchema {
  NODE_ENV: string;
  PORT: string;
  APP_CONFIG_PATH: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL: string;
  AUTH_LOGIN_MAX_ATTEMPTS: string;
  AUTH_LOCKOUT_MINUTES: string;
}

const REQUIRED_KEYS: Array<keyof EnvSchema> = ['APP_CONFIG_PATH', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

export function validateEnv(config: Record<string, unknown>): EnvSchema & Record<string, unknown> {
  const missing = REQUIRED_KEYS.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env var(s): ${missing.join(', ')}`);
  }

  return {
    ...config,
    NODE_ENV: (config.NODE_ENV as string) ?? 'development',
    PORT: (config.PORT as string) ?? '3000',
    APP_CONFIG_PATH: config.APP_CONFIG_PATH as string,
    JWT_ACCESS_SECRET: config.JWT_ACCESS_SECRET as string,
    JWT_REFRESH_SECRET: config.JWT_REFRESH_SECRET as string,
    JWT_ACCESS_TTL: (config.JWT_ACCESS_TTL as string) ?? '15m',
    JWT_REFRESH_TTL: (config.JWT_REFRESH_TTL as string) ?? '7d',
    AUTH_LOGIN_MAX_ATTEMPTS: (config.AUTH_LOGIN_MAX_ATTEMPTS as string) ?? '5',
    AUTH_LOCKOUT_MINUTES: (config.AUTH_LOCKOUT_MINUTES as string) ?? '15',
  };
}
