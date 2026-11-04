import { describe, expect, it } from 'vitest';
import { mapDatasourceValidationErrors } from './map-datasource-validation-errors';

/** The REAL 422 `details[]` contract (phase-02/phase-03's documented,
 * live-verified shape — see phase-03's "Implementation Notes"): slash-joined
 * paths relative to the entry (e.g. `transport/auth/valueEnv`), and an EMPTY
 * string path for cross-field issues (duplicate code, permissionCode
 * mismatch, etc.) — never dot-notation, never a `/datasources/<i>/...`
 * prefix (that's stripped server-side before the response leaves the API).
 *
 * Follow-up to phase-03 (visual input/output field builder): `input/output`
 * paths that point at one specific row/control (e.g. `input/fields/0/name`,
 * `output/timestampField`) now map onto that row's react-hook-form field
 * path (`inputFields.0.name`) instead of a flat inputErrors/outputErrors
 * bucket — so the server's 422 highlights the exact row, not just a block
 * of text under the whole section. */
describe('mapDatasourceValidationErrors', () => {
  it('maps a known structured-field path (slash-joined, nested) to its form field', () => {
    const result = mapDatasourceValidationErrors([{ path: 'transport/auth/valueEnv', message: 'must end in _API_KEY' }]);

    expect(result.fieldErrors).toEqual([{ field: 'authValueEnv', message: 'must end in _API_KEY' }]);
    expect(result.inputErrors).toEqual([]);
    expect(result.outputErrors).toEqual([]);
    expect(result.formErrors).toEqual([]);
  });

  it('maps an input/fields/<i>/<prop> path onto that row field (dot notation)', () => {
    const result = mapDatasourceValidationErrors([{ path: 'input/fields/0/name', message: 'is required' }]);

    expect(result.fieldErrors).toEqual([{ field: 'inputFields.0.name', message: 'is required' }]);
    expect(result.inputErrors).toEqual([]);
  });

  it('maps a nested input/fields/<i>/options/<j>/value path onto the row options sub-list', () => {
    const result = mapDatasourceValidationErrors([{ path: 'input/fields/2/options/0/value', message: 'is required' }]);

    expect(result.fieldErrors).toEqual([{ field: 'inputFields.2.options.0.value', message: 'is required' }]);
  });

  it('maps input/atLeastOneOf onto the atLeastOneOf control', () => {
    const result = mapDatasourceValidationErrors([{ path: 'input/atLeastOneOf', message: 'references unknown field "x"' }]);

    expect(result.fieldErrors).toEqual([{ field: 'inputAtLeastOneOf', message: 'references unknown field "x"' }]);
  });

  it('falls back to inputErrors for an input/-prefixed path with no specific row/control (bare "fields" array issue)', () => {
    const result = mapDatasourceValidationErrors([{ path: 'input/fields', message: 'must NOT have fewer than 1 items' }]);

    expect(result.fieldErrors).toEqual([{ field: 'inputFields', message: 'must NOT have fewer than 1 items' }]);
  });

  it('maps a bare "output" path (no suffix) to outputErrors, without the path in the message', () => {
    const result = mapDatasourceValidationErrors([{ path: 'output', message: 'must have required property "fields"' }]);

    expect(result.outputErrors).toEqual(['must have required property "fields"']);
  });

  it('maps output/timestampField and output/identityField onto their selects', () => {
    const result = mapDatasourceValidationErrors([
      { path: 'output/timestampField', message: 'is not in output.fields[].name' },
      { path: 'output/identityField', message: 'is not in output.fields[].name' },
    ]);

    expect(result.fieldErrors).toEqual([
      { field: 'outputTimestampField', message: 'is not in output.fields[].name' },
      { field: 'outputIdentityField', message: 'is not in output.fields[].name' },
    ]);
  });

  it('maps output/imageRef/<key> onto the flattened imageRef text input', () => {
    const result = mapDatasourceValidationErrors([{ path: 'output/imageRef/bucketField', message: 'is not in output.fields[].name' }]);

    expect(result.fieldErrors).toEqual([{ field: 'outputImageRefBucketField', message: 'is not in output.fields[].name' }]);
  });

  it('maps an output/fields/<i> row-level AJV issue path onto that row', () => {
    const result = mapDatasourceValidationErrors([{ path: 'output/fields/0', message: 'invalid' }]);

    expect(result.fieldErrors).toEqual([{ field: 'outputFields.0', message: 'invalid' }]);
  });

  it('maps an empty-string path (cross-field issue) to formErrors, not any field', () => {
    const result = mapDatasourceValidationErrors([{ path: '', message: 'duplicate datasource code "SAMPLE_DS"' }]);

    expect(result.formErrors).toEqual(['duplicate datasource code "SAMPLE_DS"']);
    expect(result.fieldErrors).toEqual([]);
    expect(result.inputErrors).toEqual([]);
    expect(result.outputErrors).toEqual([]);
  });

  it('falls back to formErrors (with the path kept) for an unrecognized path', () => {
    const result = mapDatasourceValidationErrors([{ path: 'some/unknown/path', message: 'boom' }]);

    expect(result.formErrors).toEqual(['some/unknown/path: boom']);
  });

  it('buckets a mix of details into their respective arrays in one pass', () => {
    const result = mapDatasourceValidationErrors([
      { path: 'transport/baseUrl', message: 'required' },
      { path: 'input/fields/0/label', message: 'is required' },
      { path: '', message: 'permissionCode mismatch' },
    ]);

    expect(result.fieldErrors).toEqual([
      { field: 'httpBaseUrl', message: 'required' },
      { field: 'inputFields.0.label', message: 'is required' },
    ]);
    expect(result.inputErrors).toEqual([]);
    expect(result.formErrors).toEqual(['permissionCode mismatch']);
  });
});
