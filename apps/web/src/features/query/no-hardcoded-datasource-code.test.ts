import { describe, it, expect } from 'vitest';

// Known datasource codes from config/config.json. If any of these appear
// inside features/query/, the "zero per-API code" invariant (phase-07 Key
// Insights) has been broken — the datasource picker, forms, and result
// renderers must work purely from server-supplied config, never a per-code
// branch. `import.meta.glob` (Vite, no Node `fs` needed — this app's
// tsconfig has no Node types) reads every source file as raw text,
// excluding test files themselves (which legitimately reference these codes
// as fixture data).
const sourceModules = import.meta.glob('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

const FORBIDDEN_CODE_LITERALS = ['CITIZEN_BASIC', 'CITIZEN_EXTENDED', 'CITIZEN_RESIDENCE', 'CITIZEN_PHOTO'];

describe('features/query has zero per-API code', () => {
  it('never references a specific datasource code literal', () => {
    const files = Object.entries(sourceModules).filter(([path]) => !/\.test\.tsx?$/.test(path));
    expect(files.length).toBeGreaterThan(0);

    for (const [path, content] of files) {
      for (const code of FORBIDDEN_CODE_LITERALS) {
        expect((content as string).includes(code), `${path} must not reference datasource code "${code}"`).toBe(false);
      }
    }
  });
});
