import { ipEquivalents, normalizeClientIp } from './client-ip.util';

describe('normalizeClientIp', () => {
  it.each([
    ['10.0.0.1', '10.0.0.1'],
    ['::ffff:10.0.0.1', '10.0.0.1'],
    ['::FFFF:10.0.0.1', '10.0.0.1'],
    ['2001:db8::1', '2001:db8::1'],
    ['foo', null],
    ['999.1.1.1', null],
    ['', null],
    [undefined, null],
    [null, null],
  ])('%p -> %p', (raw, expected) => expect(normalizeClientIp(raw as string | undefined)).toBe(expected));
});

describe('ipEquivalents', () => {
  it('IPv4 => plain + mapped', () => expect(ipEquivalents('10.0.0.1')).toEqual(['10.0.0.1', '::ffff:10.0.0.1']));
  it('mapped input => same pair', () => expect(ipEquivalents('::ffff:10.0.0.1')).toEqual(['10.0.0.1', '::ffff:10.0.0.1']));
  it('IPv6 unchanged', () => expect(ipEquivalents('2001:db8::1')).toEqual(['2001:db8::1']));
});
