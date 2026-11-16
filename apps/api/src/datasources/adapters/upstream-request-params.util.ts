import type { InputFieldDef } from '@app/shared';
import { formatDateValue } from '../date-format-parser.util';

export interface UpstreamParts {
  /** JSON body fields (POST only). */
  body: Record<string, unknown>;
  /** Query-string fields, always strings. */
  query: Record<string, string>;
}

/**
 * Splits the validated search params into what goes in the JSON body and what goes in the query string.
 * `field.in` decides per field; without it a POST sends the field in the body and a GET in the query (a GET has no
 * body, so before this existed a GET datasource could not pass the user's input at all). Date/datetime values are
 * re-written in the field's `format` (the shape the upstream expects) and the key is `mapTo ?? name`.
 */
export function buildUpstreamParts(fields: InputFieldDef[], params: Record<string, unknown>, method: 'GET' | 'POST'): UpstreamParts {
  const body: Record<string, unknown> = {};
  const query: Record<string, string> = {};
  const defaultTarget = method === 'GET' ? 'query' : 'body';

  for (const field of fields) {
    const raw = params[field.name];
    if (raw === undefined) continue;
    const value = (field.type === 'date' || field.type === 'datetime') && field.format && typeof raw === 'string' ? formatDateValue(raw, field.format) : raw;
    const key = field.mapTo ?? field.name;
    if ((field.in ?? defaultTarget) === 'query' || method === 'GET') query[key] = String(value);
    else body[key] = value;
  }
  return { body, query };
}
