import { describe, it, expect } from 'vitest';
import { describeUserAgent, parseUserAgent } from './parse-user-agent';

describe('parseUserAgent', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Chrome 120', 'Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/119.0.0.0', 'Edge 119', 'Windows'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0', 'Firefox 121', 'Linux'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15', 'Safari 17', 'macOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 'Safari 17', 'iOS'],
    ['Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36', 'Chrome 120', 'Android'],
    ['curl/8.4.0', 'curl 8', null],
  ])('%s', (ua, browser, os) => {
    expect(parseUserAgent(ua)).toEqual({ browser, os });
  });
  it('handles empty / unknown', () => {
    expect(parseUserAgent(null)).toEqual({ browser: null, os: null });
    expect(describeUserAgent('???')).toBeNull();
    expect(describeUserAgent('curl/8.4.0')).toBe('curl 8');
  });
});
