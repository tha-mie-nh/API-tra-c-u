import { describe, expect, it } from 'vitest';
import type { QueryColumn } from '@shared/index';
import { hasPhoto, inlineImageOf, recordIdOf } from './photo-record-utils';

const columns: QueryColumn[] = [
  { name: 'id', label: 'ID', type: 'string' },
  { name: 'image_base64', label: 'Ảnh', type: 'image' },
];

describe('photo record helpers', () => {
  it('accepts a numeric recordId (upstreams often send ids as numbers)', () => {
    expect(recordIdOf({ recordId: 7 })).toBe('7');
    expect(recordIdOf({ recordId: 'abc' })).toBe('abc');
  });

  it('rejects a missing or empty recordId', () => {
    expect(recordIdOf({})).toBeNull();
    expect(recordIdOf({ recordId: '' })).toBeNull();
    expect(recordIdOf({ recordId: null })).toBeNull();
  });

  it('uses an inline base64 image, adding the data: prefix when it is missing', () => {
    expect(inlineImageOf({ image_base64: 'AAAA' }, columns)).toBe('data:image/png;base64,AAAA');
    expect(inlineImageOf({ image_base64: 'data:image/jpeg;base64,BBBB' }, columns)).toBe('data:image/jpeg;base64,BBBB');
    expect(inlineImageOf({ image_base64: '' }, columns)).toBeNull();
  });

  it('a record is a photo when it has a recordId or its own image; plain info rows are not', () => {
    expect(hasPhoto({ id: 1, image_base64: 'AAAA' }, columns)).toBe(true);
    expect(hasPhoto({ recordId: 3 }, columns)).toBe(true);
    expect(hasPhoto({ id: 1 }, columns)).toBe(false);
  });
});
