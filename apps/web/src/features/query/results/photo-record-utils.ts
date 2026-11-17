import type { QueryColumn, QueryRecord } from '@shared/index';

/** The image proxy needs the per-photo row id; by convention it is the output field named `recordId`. */
const RECORD_ID_FIELD = 'recordId';

/** `recordId` as a string. Upstreams often send numeric ids (`"id": 1`); requiring a string made such photos
 * disappear and the page claim "no photos match" although the data was there. */
export function recordIdOf(record: QueryRecord): string | null {
  const value = record[RECORD_ID_FIELD];
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** An upstream that sends the picture itself (base64, with or without the `data:` prefix) in an `image` column. */
export function toDataUri(value: string): string {
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

export function inlineImageOf(record: QueryRecord, columns: QueryColumn[]): string | null {
  for (const column of columns) {
    if (column.type !== 'image') continue;
    const value = record[column.name];
    if (typeof value === 'string' && value.length > 0) return toDataUri(value);
  }
  return null;
}

/** A record is a photo when it can be fetched through the proxy (`recordId`) or already carries its own image. */
export function hasPhoto(record: QueryRecord, columns: QueryColumn[]): boolean {
  return recordIdOf(record) !== null || inlineImageOf(record, columns) !== null;
}
