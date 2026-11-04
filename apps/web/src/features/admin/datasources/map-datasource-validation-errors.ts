import type { ApiErrorDetail } from '@/lib/api-client';

/** Maps the admin-datasources 422 `details[]` path (slash-joined, relative
 * to the entry — e.g. `transport/auth/valueEnv`, see phase-02's
 * `relativizeIssuePath`) onto the structured form field it corresponds to.
 * Values are react-hook-form field PATHS (strings, incl. dynamic array
 * indices like `inputFields.2.name`) rather than `keyof
 * DatasourceFormValues`, since the field builder's rows are arrays. */
const FIELD_PATH_MAP: Record<string, string> = {
  code: 'code',
  name: 'name',
  description: 'description',
  type: 'type',
  enabled: 'enabled',
  'transport/kind': 'transportKind',
  'transport/dataFile': 'mockDataFile',
  'transport/baseUrl': 'httpBaseUrl',
  'transport/path': 'httpPath',
  'transport/method': 'httpMethod',
  'transport/timeoutMs': 'httpTimeoutMs',
  'transport/headers': 'headers',
  'transport/auth/kind': 'authKind',
  'transport/auth/header': 'authHeader',
  'transport/auth/valueEnv': 'authValueEnv',
  'limits/maxResults': 'maxResults',
  'limits/pageSize': 'pageSize',
};

/** `input.atLeastOneOf`/`input.requireGroups` top-level issues. */
const INPUT_TOP_LEVEL_MAP: Record<string, string> = {
  atLeastOneOf: 'inputAtLeastOneOf',
  requireGroups: 'inputRequireGroups',
};

/** `output.*` top-level (non-`fields`, non-`imageRef`) issues. */
const OUTPUT_TOP_LEVEL_MAP: Record<string, string> = {
  timestampField: 'outputTimestampField',
  sortOrder: 'outputSortOrder',
  identityField: 'outputIdentityField',
  recordsPath: 'outputRecordsPath',
  totalPath: 'outputTotalPath',
  requestIdPath: 'outputRequestIdPath',
};

const IMAGE_REF_MAP: Record<string, string> = {
  bucketField: 'outputImageRefBucketField',
  objectKeyField: 'outputImageRefObjectKeyField',
  mimeField: 'outputImageRefMimeField',
};

/** `fields/<i>/<rest>` -> `inputFields.<i>.<rest>` (dots, for react-hook-form). */
function mapFieldsArrayPath(prefix: 'inputFields' | 'outputFields', rest: string): string {
  return `${prefix}.${rest.replace(/\//g, '.')}`;
}

/** `rest` = the part of the path after `input/`. Returns a form field path,
 * or `null` if it doesn't correspond to one specific row/control (falls
 * back to the `input`-level error bucket). */
function mapInputRelativePath(rest: string): string | null {
  if (rest === 'fields' || rest.startsWith('fields/')) {
    return rest === 'fields' ? 'inputFields' : mapFieldsArrayPath('inputFields', rest.slice('fields/'.length));
  }
  const topLevelKey = rest.split('/')[0]!;
  if (topLevelKey in INPUT_TOP_LEVEL_MAP) {
    const mapped = INPUT_TOP_LEVEL_MAP[topLevelKey]!;
    const suffix = rest.slice(topLevelKey.length);
    return `${mapped}${suffix.replace(/\//g, '.')}`;
  }
  return null;
}

/** Same idea as `mapInputRelativePath`, for `output/`. */
function mapOutputRelativePath(rest: string): string | null {
  if (rest === 'fields' || rest.startsWith('fields/')) {
    return rest === 'fields' ? 'outputFields' : mapFieldsArrayPath('outputFields', rest.slice('fields/'.length));
  }
  if (rest.startsWith('imageRef/')) return IMAGE_REF_MAP[rest.slice('imageRef/'.length)] ?? null;
  const topLevelKey = rest.split('/')[0]!;
  return topLevelKey in OUTPUT_TOP_LEVEL_MAP ? OUTPUT_TOP_LEVEL_MAP[topLevelKey]! : null;
}

export interface MappedDatasourceValidationErrors {
  /** `field` is a react-hook-form field path string (may be a nested array
   * path, e.g. `outputFields.1.from`) — cast at the `setError` call site. */
  fieldErrors: { field: string; message: string }[];
  /** `input`/`output` issues that don't map onto one specific row/control
   * (e.g. a bare block-level AJV error) — shown as a block message under
   * the respective section instead. */
  inputErrors: string[];
  outputErrors: string[];
  /** Cross-field issues (empty `path`, e.g. duplicate code / unique
   * constraint failures from `validateCrossFieldConstraints`) and anything
   * else not mapped to a known field. */
  formErrors: string[];
}

/** Cross-field issues come back with `path: ''` (phase-02's
 * `buildConfigSnapshot`), so there's no per-field home for them — they
 * always land in `formErrors`. */
export function mapDatasourceValidationErrors(details: ApiErrorDetail[]): MappedDatasourceValidationErrors {
  const result: MappedDatasourceValidationErrors = { fieldErrors: [], inputErrors: [], outputErrors: [], formErrors: [] };

  for (const { path, message } of details) {
    if (path === '') {
      result.formErrors.push(message);
    } else if (path in FIELD_PATH_MAP) {
      result.fieldErrors.push({ field: FIELD_PATH_MAP[path]!, message });
    } else if (path === 'input') {
      result.inputErrors.push(message);
    } else if (path === 'output') {
      result.outputErrors.push(message);
    } else if (path.startsWith('input/')) {
      const mapped = mapInputRelativePath(path.slice('input/'.length));
      if (mapped) result.fieldErrors.push({ field: mapped, message });
      else result.inputErrors.push(`${path}: ${message}`);
    } else if (path.startsWith('output/')) {
      const mapped = mapOutputRelativePath(path.slice('output/'.length));
      if (mapped) result.fieldErrors.push({ field: mapped, message });
      else result.outputErrors.push(`${path}: ${message}`);
    } else {
      result.formErrors.push(`${path}: ${message}`);
    }
  }

  return result;
}
