import { resolveQueryLogScope } from './resolve-query-log-scope';

describe('resolveQueryLogScope', () => {
  it('view_all -> no forced user', () => {
    const r = resolveQueryLogScope({ id: 'u1' }, new Set(['history:view_all', 'history:view_sensitive']));
    expect(r).toEqual({ scope: {}, canViewAll: true, canViewSensitive: true });
  });
  it('view_own only -> forced to caller', () => {
    const r = resolveQueryLogScope({ id: 'u1' }, new Set(['history:view_own']));
    expect(r).toEqual({ scope: { forcedUserId: 'u1' }, canViewAll: false, canViewSensitive: false });
  });
  it('no history perms at all -> still forced (fail closed)', () => {
    expect(resolveQueryLogScope({ id: 'u2' }, new Set()).scope).toEqual({ forcedUserId: 'u2' });
  });
});
