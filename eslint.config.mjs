// Single shared flat ESLint config for the whole pnpm workspace
// (apps/api, apps/web, packages/shared). ESLint 9 flat config resolution
// walks up from cwd, so running `eslint .` inside any workspace package
// picks this file up automatically — no per-package eslint.config.mjs needed.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.config.{js,mjs,cjs}',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Plain CommonJS maintenance scripts (scripts/*.js) — TS files get Node
    // globals via @types/node through tsconfig; these don't, so js.configs
    // .recommended's `no-undef` flags `process`/`console`/`require`/etc.
    // without this.
    files: ['scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { process: 'readonly', console: 'readonly', require: 'readonly', module: 'writable', __dirname: 'readonly' },
    },
    rules: {
      // Intentionally plain CommonJS (no "type":"module" in package.json) —
      // not a TS/ESM file to begin with, so this rule doesn't apply.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  eslintConfigPrettier,
);
