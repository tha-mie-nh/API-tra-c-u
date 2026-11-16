import { resolve, sep } from 'node:path';
import type { DatasourceConfigFile } from '@app/shared';
import { apiPermissionCode } from '@app/shared';
import { isValidTimeZone } from './date-format-parser.util';

/**
 * Cross-field constraints JSON Schema cannot express (phase-04 Implementation
 * Step 2/3): unique `code`s, `identityField`/`timestampField`/`imageRef.*`
 * must reference an existing `output.fields[].name`, `atLeastOneOf` must
 * reference existing input fields, and per-`transport.kind` requiredness.
 * Phase 01 additions: `permissionCode` must be the code's own derivation (an
 * admin-edited mismatch would silently break the web route's permission
 * check), and a mock `dataFile` must resolve inside `configDir` (an
 * admin-entered `../../..` path must not read arbitrary files) — both skip
 * when `configDir` is omitted (boot path always passes it; existing unit
 * tests that don't care about path containment may omit it).
 * Returns the list of human-readable issues (empty = valid); the caller logs
 * + throws so a bad config fails the boot, not a query.
 */
export function validateCrossFieldConstraints(config: DatasourceConfigFile, configDir?: string): string[] {
  const issues: string[] = [];
  const seenCodes = new Set<string>();
  const dictionaries = config.dictionaries ?? {};
  for (const [name, items] of Object.entries(dictionaries)) {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.value)) issues.push(`dictionaries.${name}: duplicate value "${item.value}"`);
      seen.add(item.value);
    }
  }

  for (const ds of config.datasources) {
    if (seenCodes.has(ds.code)) {
      issues.push(`duplicate datasource code "${ds.code}"`);
    }
    seenCodes.add(ds.code);

    const expectedPermissionCode = apiPermissionCode(ds.code);
    if (ds.permissionCode !== expectedPermissionCode) {
      issues.push(
        `${ds.code}: permissionCode "${ds.permissionCode}" does not match the required derivation "${expectedPermissionCode}"`,
      );
    }

    const outputFieldNames = new Set(ds.output.fields.map((f) => f.name));
    if (ds.output.labelField && !outputFieldNames.has(ds.output.labelField)) {
      issues.push(`${ds.code}: output.labelField "${ds.output.labelField}" is not in output.fields[].name`);
    }
    for (const f of ds.output.fields) {
      if (f.valueMapRef && !(f.valueMapRef in dictionaries)) {
        issues.push(`${ds.code}: output field "${f.name}" valueMapRef references unknown dictionary "${f.valueMapRef}"`);
      }
      for (const [key, zone] of [['sourceTimeZone', f.sourceTimeZone], ['displayTimeZone', f.displayTimeZone]] as const) {
        if (zone && !isValidTimeZone(zone)) issues.push(`${ds.code}: output field "${f.name}" ${key} "${zone}" is not a valid IANA time zone`);
      }
    }
    for (const f of ds.input.fields) {
      if (f.in === 'body' && ds.transport.kind === 'http' && ds.transport.method === 'GET') {
        issues.push(`${ds.code}: input field "${f.name}" has in=body but the transport method is GET (a GET has no body)`);
      }
      if (f.optionsRef && !(f.optionsRef in dictionaries)) {
        issues.push(`${ds.code}: input field "${f.name}" optionsRef references unknown dictionary "${f.optionsRef}"`);
      }
    }
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
    } else if (ds.transport.kind === 'mock' && configDir) {
      const resolved = resolve(configDir, ds.transport.dataFile);
      if (resolved !== configDir && !resolved.startsWith(configDir + sep)) {
        issues.push(`${ds.code}: transport.dataFile "${ds.transport.dataFile}" resolves outside configDir`);
      }
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
