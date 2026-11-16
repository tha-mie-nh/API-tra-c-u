import { formatLogLine } from './app-text-logger.service';

describe('formatLogLine', () => {
  it('renders `asctime - LEVEL - context - message` in the requested time zone', () => {
    const line = formatLogLine(new Date('2026-11-16T02:05:01.123Z'), 'info', 'HttpRequest', '--> GET /x', 'Asia/Ho_Chi_Minh');
    expect(line).toBe('2026-11-16 09:05:01,123 - INFO - HttpRequest - --> GET /x');
  });

  it('falls back to App when no context is given', () => {
    expect(formatLogLine(new Date('2026-01-01T00:00:00.000Z'), 'error', undefined, 'boom', 'UTC')).toBe('2026-01-01 00:00:00,000 - ERROR - App - boom');
  });
});
