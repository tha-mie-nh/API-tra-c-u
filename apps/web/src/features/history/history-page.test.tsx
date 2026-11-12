import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FEATURE_PERMISSION_CODES as P, type QueryLogDetail } from '@shared/index';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { HistoryPage } from './history-page';
import * as api from './history-api';

// Radix Checkbox measures itself with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock('./history-api', async () => {
  const actual = await vi.importActual<typeof import('./history-api')>('./history-api');
  return {
    ...actual,
    fetchHistoryList: vi.fn(),
    fetchHistorySummary: vi.fn(),
    fetchHistoryDetail: vi.fn(),
    downloadHistoryCsv: vi.fn(),
    fetchHistoryDatasourceOptions: vi.fn(() => Promise.resolve([])),
  };
});

const detail: QueryLogDetail = {
  id: '11111111-1111-4111-8111-111111111111', userId: 'user-1', username: 'alice', datasourceCode: 'ds1', querySummary: 'cccd=***',
  status: 'failed', statusCode: 504, errorCode: 'UPSTREAM_TIMEOUT', recordCount: null, durationMs: 1200,
  createdAt: '2026-11-04T17:00:00.000Z', queryParams: { cccd: '***' }, errorMessage: 'timeout',
  upstreamRequestId: 'up-9', ip: '10.1.1.1',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
};

function LocationProbe() {
  return <span data-testid="loc">{useLocation().search}</span>;
}

function setup(url: string, permissions: string[]) {
  useAuthStore.setState({
    accessToken: 't', status: 'authenticated',
    user: { id: '1', username: 'u', fullName: 'U', email: null, mustChangePassword: false, permissions, roles: [] },
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <HistoryPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ALL = [P.HISTORY_VIEW_ALL];
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchHistoryList).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
  vi.mocked(api.fetchHistorySummary).mockResolvedValue({
    total: 7, success: 5, failed: 1, denied: 1, answered: 4, gap: 3, empty: 1, successRate: 0.7142, avgDurationMs: 100, p95DurationMs: 900,
  });
  vi.mocked(api.fetchHistoryDetail).mockResolvedValue(detail);
});

describe('HistoryPage URL filters', () => {
  it('sends the drill-down link filter to list and summary', async () => {
    setup('/lich-su?from=2026-11-04T17:00:00.000Z&to=2026-11-11T17:00:00.000Z&status=failed,denied&errorCode=__null__&outcome=gap', ALL);
    await waitFor(() => expect(api.fetchHistoryList).toHaveBeenCalled());
    const expected = { from: '2026-11-04T17:00:00.000Z', to: '2026-11-11T17:00:00.000Z', status: 'failed,denied', errorCode: '__null__', outcome: 'gap' };
    expect(vi.mocked(api.fetchHistoryList).mock.calls[0]?.[0]).toMatchObject({ ...expected, page: 1, pageSize: 20 });
    await waitFor(() => expect(api.fetchHistorySummary).toHaveBeenCalledWith(expected));
    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(screen.getByTestId('history-active-chips')).toHaveTextContent('Chưa trả lời được');
  });

  it('writes applied filters to the URL and removes a chip', async () => {
    const user = userEvent.setup();
    setup('/lich-su?outcome=gap&page=2', ALL);
    await user.type(await screen.findByLabelText('Mã lỗi'), 'E1');
    await user.click(screen.getByRole('button', { name: 'Tìm lịch sử' }));
    const search = () => new URLSearchParams(screen.getByTestId('loc').textContent ?? '');
    expect(search().get('errorCode')).toBe('E1');
    expect(search().get('outcome')).toBe('gap');
    expect(search().get('page')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Bỏ lọc Kết quả tra cứu/ }));
    expect(search().get('outcome')).toBeNull();
    expect(search().get('errorCode')).toBe('E1');
  });

  it('view_own: no admin controls, no summary call, admin-only filters not sent', async () => {
    setup('/lich-su?username=bob&ip=1.2.3.4&userId=x&status=failed', [P.HISTORY_VIEW_OWN]);
    await waitFor(() => expect(api.fetchHistoryList).toHaveBeenCalled());
    expect(screen.queryByLabelText('Tên đăng nhập')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Địa chỉ IP')).not.toBeInTheDocument();
    expect(api.fetchHistorySummary).not.toHaveBeenCalled();
    const sent = vi.mocked(api.fetchHistoryList).mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(sent.status).toBe('failed');
    expect(sent).not.toHaveProperty('username');
    expect(sent).not.toHaveProperty('ip');
    expect(sent).not.toHaveProperty('userId');
  });

  it('CSV button only with history:export and downloads the current filter', async () => {
    const user = userEvent.setup();
    const view = setup('/lich-su?status=failed', ALL);
    await waitFor(() => expect(api.fetchHistoryList).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Xuất CSV' })).not.toBeInTheDocument();
    view.unmount();

    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.mocked(api.downloadHistoryCsv).mockResolvedValue({ blob: new Blob(['a']), filename: 'x.csv', total: 60000, exported: 50000, truncated: true });
    setup('/lich-su?status=failed', [P.HISTORY_VIEW_ALL, P.HISTORY_EXPORT]);
    await user.click(await screen.findByRole('button', { name: 'Xuất CSV' }));
    await waitFor(() => expect(api.downloadHistoryCsv).toHaveBeenCalledWith({ status: 'failed' }));
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('50.000')));
  });

  it('sort header toggles sort in URL', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchHistoryList).mockResolvedValue({
      items: [{ ...detail, recordCount: 1 }], page: 1, pageSize: 20, total: 1,
    });
    setup('/lich-su', ALL);
    await user.click(await screen.findByRole('button', { name: 'Sắp xếp theo Thời gian xử lý' }));
    const sp = new URLSearchParams(screen.getByTestId('loc').textContent ?? '');
    expect(sp.get('sort')).toBe('durationMs');
    expect(sp.get('order')).toBe('desc');
  });
});

describe('HistoryPage detail (?detail=)', () => {
  it('shows all fields and related links built from URL filters', async () => {
    setup('/lich-su?detail=11111111-1111-4111-8111-111111111111', ALL);
    expect(await screen.findByText('11111111-1111-4111-8111-111111111111')).toBeInTheDocument();
    expect(screen.getByText('cccd=***')).toBeInTheDocument();
    expect(screen.getByText('UPSTREAM_TIMEOUT')).toBeInTheDocument();
    expect(screen.getByText('10.1.1.1')).toBeInTheDocument();
    expect(screen.getByText('Chrome 120 / Windows')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sao chép Mã yêu cầu upstream/ })).toBeInTheDocument();
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href') ?? '';
    expect(href('Cùng người dùng và API')).toBe('/lich-su?datasourceCode=ds1&userId=user-1');
    expect(href('Cùng địa chỉ IP')).toBe('/lich-su?ip=10.1.1.1');
    expect(href('Cùng mã lỗi')).toContain('errorCode=UPSTREAM_TIMEOUT');
    expect(href('Cùng mã lỗi')).toContain('status=failed%2Cdenied');
  });

  it('view_own: no user/IP related links', async () => {
    setup('/lich-su?detail=11111111-1111-4111-8111-111111111111', [P.HISTORY_VIEW_OWN]);
    await screen.findByText('11111111-1111-4111-8111-111111111111');
    expect(screen.queryByRole('link', { name: 'Cùng địa chỉ IP' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cùng người dùng và API' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cùng mã lỗi' })).toBeInTheDocument();
  });

  it('malformed id: shows "not found" and never calls the API', async () => {
    setup('/lich-su?detail=../admin/users', ALL);
    expect(await screen.findByText('Không tìm thấy bản ghi tra cứu này.')).toBeInTheDocument();
    expect(api.fetchHistoryDetail).not.toHaveBeenCalled();
  });

  it('API 404: shows "not found"', async () => {
    vi.mocked(api.fetchHistoryDetail).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x', 'r'));
    setup('/lich-su?detail=22222222-2222-4222-8222-222222222222', ALL);
    expect(await screen.findByText('Không tìm thấy bản ghi tra cứu này.')).toBeInTheDocument();
  });
});
