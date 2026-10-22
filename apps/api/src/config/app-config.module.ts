import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { validateEnv } from './env-validation';

// The repo's single .env file lives at the monorepo root (outside apps/api),
// so both `pnpm dev` (cwd = apps/api) and the Docker image (WORKDIR = /repo)
// resolve it correctly, this is computed from __dirname (not process.cwd())
// -- src/config -> src -> api -> apps -> repo root, same depth for the
// compiled dist/config -> dist -> api -> apps -> repo root. Missing file is
// not fatal: @nestjs/config falls back to real process.env (Docker injects
// env vars directly via `env_file`, no .env file needed there).
const ROOT_ENV_PATH = join(__dirname, '..', '..', '..', '..', '.env');

/**
 * Global env config module. Wraps @nestjs/config so every feature module can
 * inject ConfigService instead of touching process.env directly.
 * APP_CONFIG_PATH points at the root-level config/config.json (datasource DSL,
 * filled in by Phase 04) — kept outside apps/api so ops can mount/override it
 * without rebuilding the image.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [ROOT_ENV_PATH],
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
