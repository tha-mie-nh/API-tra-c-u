import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { FEATURE_PERMISSION_CODES, QUERY_INSIGHTS_RULES, type QueryInsightsAnomalies } from '@shared/index';
import { useAuthStore } from '@/lib/auth-store';
import { QueryInsightsAnomalyRules } from './query-insights-anomaly-rules';
import { OffHoursTable, SharedIdentitiesTable, SharedIpsTable, SpikesTable } from './query-insights-anomaly-tables';
import { QueryInsightsTopUsersTable } from './query-insights-top-users-table';
import { QueryInsightsExportCsvButton } from './query-insights-export-csv-button';

const filter = { from: '2026-11-04T17:00:00.000Z', to: '2026-11-11T17:00:00.000Z' };
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const href = (name: RegExp | string) => screen.getByRole('link', { name }).getAttribute('href') ?? '';

function setPermissions(permissions: string[]) {
  useAuthStore.setState({
    accessToken: 't',
    status: 'authenticated',
    user: { id: '1', username: 'u', fullName: 'U', email: null, mustChangePassword: false, permissions, roles: [] },
  });
}

describe('top users table', () => {
  it('counts link to /lich-su with userId + counter filter; username links to the user page', () => {
    wrap(
      <QueryInsightsTopUsersTable
        filter={filter}
        rangeSearch="from=2026-11-05&to=2026-11-11"
        rows={[{ userId: 'u1', username: 'alice', requests: 10, answered: 5, gap: 5, success: 6, empty: 1, failed: 3, denied: 1, errors: 4, records: 9, avgDurationMs: 5, p95DurationMs: 9, lastAt: '2026-11-10T00:00:00Z' }]}
      />,
    );
    const failed = new URLSearchParams(href(/Thất bại/).split('?')[1]);
    expect(failed.get('status')).toBe('failed');
    expect(failed.get('userId')).toBe('u1');
    expect(new URLSearchParams(href(/Không có dữ liệu/).split('?')[1]).get('outcome')).toBe('gap');
    expect(href('alice')).toBe('/quan-tri/phan-tich-tra-cuu/nguoi-dung/u1?from=2026-11-05&to=2026-11-11');
  });
});

describe('anomalies', () => {
  const data: QueryInsightsAnomalies = {
    rules: QUERY_INSIGHTS_RULES,
    spikes: [{ userId: 'u1', username: 'alice', day: '2026-11-10', count: 50, baselineAvg: 5 }],
    offHours: [{ userId: 'u1', username: 'alice', offHoursCount: 7, total: 10, ratio: 0.7, firstAt: '2026-11-08T00:00:00Z', lastAt: '2026-11-09T00:00:00Z' }],
    sharedIdentities: [
      { fieldNames: ['cccd'], valueDisplay: '0123****789', datasourceCodes: ['ds1'], distinctUsers: 3, requests: 9, users: [{ userId: 'u1', username: 'alice', count: 4 }], firstAt: '2026-11-05T00:00:00Z', lastAt: '2026-11-06T00:00:00Z' },
    ],
    sharedIps: [{ ip: '2001:db8::1', distinctUsers: 2, usernames: ['alice', 'bob'], requests: 6, lastAt: '2026-11-06T00:00:00Z' }],
  };
  const common = { filter, rangeSearch: 'from=2026-11-05&to=2026-11-11' };

  it('shows rules thresholds and the holiday caveat', () => {
    render(<QueryInsightsAnomalyRules rules={QUERY_INSIGHTS_RULES} />);
    expect(screen.getByText(/Ngày lễ chưa được tính/)).toBeInTheDocument();
    expect(screen.getByText(/>= 20 lượt\/ngày/)).toBeInTheDocument();
  });
  it('off-hours count is an exact drill (userId + offHours=true + range)', () => {
    wrap(<OffHoursTable rows={data.offHours} {...common} />);
    const p = new URLSearchParams(href(/alice: 7/).split('?')[1]);
    expect(p.get('offHours')).toBe('true');
    expect(p.get('userId')).toBe('u1');
    expect(p.get('from')).toBe(filter.from);
  });
  it('spike count drills to that VN day', () => {
    wrap(<SpikesTable rows={data.spikes} {...common} />);
    expect(new URLSearchParams(href(/alice 2026-11-10: 50/).split('?')[1]).get('to')).toBe('2026-11-10T17:00:00.000Z');
  });
  it('shared identities: masked value only, approximate note, no value in any link', () => {
    wrap(<SharedIdentitiesTable rows={data.sharedIdentities} {...common} />);
    expect(screen.getByText('0123****789')).toBeInTheDocument();
    expect(screen.getAllByText(/chỉ mang tính xấp xỉ/).length).toBeGreaterThan(0);
    const approx = href(/alice \(xấp xỉ\)/);
    expect(approx).not.toContain('0123');
    expect(new URLSearchParams(approx.split('?')[1]).get('datasourceCode')).toBe('ds1');
  });
  it('shared IPs link to the IP page with IPv6 encoded', () => {
    wrap(<SharedIpsTable rows={data.sharedIps} {...common} />);
    expect(href('2001:db8::1')).toBe('/quan-tri/phan-tich-tra-cuu/ip/2001%3Adb8%3A%3A1?from=2026-11-05&to=2026-11-11');
  });
});

describe('CSV button permission', () => {
  beforeEach(() => vi.clearAllMocks());
  it('is hidden without history:export', () => {
    setPermissions([FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL]);
    render(<QueryInsightsExportCsvButton table="top-errors" label="Mã lỗi" filter={filter} />);
    expect(screen.queryByRole('button', { name: /Xuất CSV/ })).not.toBeInTheDocument();
  });
  it('is shown with history:export', () => {
    setPermissions([FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL, FEATURE_PERMISSION_CODES.HISTORY_EXPORT]);
    render(<QueryInsightsExportCsvButton table="top-errors" label="Mã lỗi" filter={filter} />);
    expect(screen.getByRole('button', { name: /Xuất CSV/ })).toBeInTheDocument();
  });
});
