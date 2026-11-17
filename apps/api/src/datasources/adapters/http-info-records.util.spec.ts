import { toRecordList } from './http-info.adapter';

describe('toRecordList', () => {
  it('accepts an array at the root (no recordsPath)', () => {
    expect(toRecordList([{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('wraps a single object as one record', () => {
    expect(toRecordList({ id: 1 })).toEqual([{ id: 1 }]);
  });

  it('returns no records for anything else, and drops non-object items', () => {
    expect(toRecordList(undefined)).toEqual([]);
    expect(toRecordList('text')).toEqual([]);
    expect(toRecordList([1, null, { id: 3 }])).toEqual([{ id: 3 }]);
  });
});
