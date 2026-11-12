import { parseTrustProxy } from './trust-proxy.util';

describe('parseTrustProxy', () => {
  it.each([
    [undefined, false], ['', false], ['  ', false], ['false', false], ['FALSE', false],
    ['true', true], ['TRUE', true], ['2', 2], ['0', 0],
    ['loopback, uniquelocal', 'loopback, uniquelocal'],
    ['10.0.0.0/8', '10.0.0.0/8'],
    ['10.0.0.1', '10.0.0.1'],
    ['fc00::/7, loopback', 'fc00::/7, loopback'],
  ])('valid %p -> %p', (raw, expected) => {
    const onInvalid = jest.fn();
    expect(parseTrustProxy(raw as string | undefined, onInvalid)).toBe(expected);
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it.each(['yes', '1.5', '-1', '10.0.0.0/33', '::1/129', '999.1.1.1', 'loopback,', 'loopback, nope', '10.0.0.0/8/2', 'on'])(
    'invalid %p -> false + warning callback', (raw) => {
      const onInvalid = jest.fn();
      expect(parseTrustProxy(raw, onInvalid)).toBe(false);
      expect(onInvalid).toHaveBeenCalledWith(raw);
    },
  );

  it('does not throw without callback', () => expect(parseTrustProxy('yes')).toBe(false));
});
