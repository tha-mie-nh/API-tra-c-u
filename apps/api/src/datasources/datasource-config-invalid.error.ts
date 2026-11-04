/** One structured validation failure — `path` is empty for config-wide issues (e.g. duplicate code, mock-in-prod). */
export interface DatasourceConfigIssue {
  path: string;
  message: string;
}

/**
 * Thrown by `buildConfigSnapshot` (`config-snapshot-builder.ts`) for ANY
 * validation failure: AJV schema, cross-field constraints, missing env var
 * during secret resolution, or mock-in-production. Carries structured
 * `issues` (not just a message string) so Phase 02's admin API can return
 * field-level errors to the UI instead of one opaque string.
 */
export class DatasourceConfigInvalidError extends Error {
  readonly issues: DatasourceConfigIssue[];

  constructor(issues: DatasourceConfigIssue[]) {
    super(formatIssues(issues));
    this.name = 'DatasourceConfigInvalidError';
    this.issues = issues;
  }
}

/** Shared formatting used both by this error's own `message` and the loader's boot-time log line. */
export function formatIssues(issues: DatasourceConfigIssue[]): string {
  return issues.map((i) => `  - ${i.path || '(root)'} ${i.message}`).join('\n');
}
