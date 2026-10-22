import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// Single source of truth for ports is the repo-root `.env` (see
// docs/running-the-project.md), not apps/web/.env — Vite's default envDir is
// this package, so it's pointed up to the repo root explicitly. Called at
// top level (not inside a defineConfig callback) so this file stays a plain
// object export — vitest.config.ts's `mergeConfig(viteConfig, ...)` cannot
// merge a callback-form config.
const env = loadEnv('development', fileURLToPath(new URL('../..', import.meta.url)), '');
const webPort = Number(env.WEB_PORT ?? 5173);
const apiPort = Number(env.API_PORT ?? env.PORT ?? 3000);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: webPort,
    // Fail loudly if the port is taken instead of silently picking the next
    // free one — a silently-shifted port is exactly what breaks a "fixed
    // ports" expectation during a demo.
    strictPort: true,
    // Same-origin dev proxy to the NestJS API (phase-06 architecture) — the
    // browser only ever talks to :webPort, so `credentials:'include'` in
    // lib/api-client.ts carries the refresh cookie without any CORS dance.
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
})
