import type { DatasourceConfigFile } from '@app/shared';

/**
 * Cross-field constraints JSON Schema cannot express (phase-04 Implementation
 * Step 2/3): unique `code`s, `identityField`/`timestampField`/`imageRef.*`
 * must reference an existing `output.fields[].name`, `atLeastOneOf` must
 * reference existing input fields, and per-`transport.kind` requiredness.
 * Returns the list of human-readable issues (empty = valid); the caller logs
 * + throws so a bad config fails the boot, not a query.
 */
export function validateCrossFieldConstraints(config: DatasourceConfigFile): string[] {
  const issues: string[] = [];
  const seenCodes = new Set<string>();

  for (const ds of config.datasources) {
    if (seenCodes.has(ds.code)) {
      issues.push(`duplicate datasource code "${ds.code}"`);
    }
    seenCodes.add(ds.code);

    const outputFieldNames = new Set(ds.output.fields.map((f) => f.name));
    if (!outputFieldNames.has(ds.output.identityField)) {
      issues.push(`${ds.code}: output.identityField "${ds.output.identityField}" is not in output.fields[].name`);
    }
    if (!outputFieldNames.has(ds.output.timestampField)) {
      issues.push(`${ds.code}: output.timestampField "${ds.output.timestampField}" is not in output.fields[].name`);
    }
    if (ds.output.imageRef) {
      for (const key of ['bucketField', 'objectKeyField', 'mimeField'] as const) {
        const fieldName = ds.output.imageRef[key];
        if (!outputFieldNames.has(fieldName)) {
          issues.push(`${ds.code}: output.imageRef.${key} "${fieldName}" is not in output.fields[].name`);
        }
      }
    }

    const inputFieldNames = new Set(ds.input.fields.map((f) => f.name));
    for (const name of ds.input.atLeastOneOf ?? []) {
      if (!inputFieldNames.has(name)) {
        issues.push(`${ds.code}: input.atLeastOneOf references unknown input field "${name}"`);
      }
    }
    for (const group of ds.input.requireGroups ?? []) {
      for (const name of group) {
        if (!inputFieldNames.has(name)) {
          issues.push(`${ds.code}: input.requireGroups references unknown input field "${name}"`);
        }
      }
    }

    if (ds.transport.kind === 'mock' && !ds.transport.dataFile) {
      issues.push(`${ds.code}: transport.kind=mock requires transport.dataFile`);
    }
    if (ds.transport.kind === 'http' && (!ds.transport.baseUrl || !ds.transport.path)) {
      issues.push(`${ds.code}: transport.kind=http requires transport.baseUrl and transport.path`);
    }
    if (
      ds.transport.kind === 'minio-pg' &&
      (!ds.transport.pgUrlEnv || !ds.transport.minio || !ds.transport.query || !ds.transport.recordQuery)
    ) {
      issues.push(
        `${ds.code}: transport.kind=minio-pg requires transport.pgUrlEnv, transport.minio, transport.query and transport.recordQuery`,
      );
    }
  }

  return issues;
}
