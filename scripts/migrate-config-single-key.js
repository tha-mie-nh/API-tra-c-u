#!/usr/bin/env node
/**
 * One-off migration: "map once" field keys.
 *
 * Before: input `name` (system key) -> `mapTo` (API key); output `from` (API key) -> `name` -> `label`.
 * After : `name` IS the API key and `label` is what users see; `mapTo` / `from` are dropped
 *         (kept only when they are nested paths such as `data.hoTen`, which cannot be a form key).
 *
 * Usage: node scripts/migrate-config-single-key.js <config.json> [--write]
 * Without --write it only prints what would change. Idempotent.
 */
const fs = require('node:fs');

const file = process.argv[2];
const write = process.argv.includes('--write');
if (!file) {
  console.error('Usage: node scripts/migrate-config-single-key.js <config.json> [--write]');
  process.exit(1);
}

const SIMPLE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
const log = [];

function rename(list, key, ds, kind) {
  const renames = new Map();
  const taken = new Set(list.map((f) => f.name));
  for (const field of list) {
    const apiKey = field[key];
    if (!apiKey || apiKey === field.name) {
      delete field[key];
      continue;
    }
    if (!SIMPLE_KEY.test(apiKey)) continue; // nested path: keep as advanced setting
    if (taken.has(apiKey)) {
      log.push(`SKIP ${ds.code} ${kind} "${field.name}" -> "${apiKey}": name already used by another field`);
      continue;
    }
    taken.delete(field.name);
    taken.add(apiKey);
    renames.set(field.name, apiKey);
    log.push(`${ds.code} ${kind}: ${field.name} -> ${apiKey} ("${field.label}")`);
    field.name = apiKey;
    delete field[key];
  }
  return renames;
}

const swap = (value, renames) => renames.get(value) ?? value;

for (const ds of config.datasources) {
  const inRenames = rename(ds.input.fields, 'mapTo', ds, 'input');
  if (ds.input.atLeastOneOf) ds.input.atLeastOneOf = ds.input.atLeastOneOf.map((n) => swap(n, inRenames));
  if (ds.input.requireGroups) ds.input.requireGroups = ds.input.requireGroups.map((g) => g.map((n) => swap(n, inRenames)));

  const hadFullName = ds.output.fields.some((f) => f.name === 'fullName');
  const outRenames = rename(ds.output.fields, 'from', ds, 'output');
  for (const key of ['identityField', 'timestampField', 'labelField']) {
    if (ds.output[key]) ds.output[key] = swap(ds.output[key], outRenames);
  }
  if (hadFullName && !ds.output.labelField && outRenames.has('fullName')) ds.output.labelField = outRenames.get('fullName');
  if (ds.output.imageRef) {
    for (const key of Object.keys(ds.output.imageRef)) ds.output.imageRef[key] = swap(ds.output.imageRef[key], outRenames);
  }
}

console.log(log.join('\n') || 'nothing to migrate');
if (write) {
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`written ${file}`);
}
