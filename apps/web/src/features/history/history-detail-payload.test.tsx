import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FEATURE_PERMISSION_CODES as P, type QueryLogDetail, type QueryLogPayloadResponse } from '@shared/index';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { HistoryDetailDialog } from './history-detail-dialog';
import * as api from './history-api';
import * as saveBlobModule from '@/lib/save-blob';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/save-blob', () => ({ saveBlob: vi.fn() }));
vi.mock('./history-api', async () => {
  const actual = await vi.importActual<typeof import('./history-api')>('./history-api');
  return { ...actual, fetchHistoryDetail: vi.fn(), fetchHistoryPayload: vi.fn() };
});

const ID = '11111111-1111-4111-8111-111111111111';
const detail: QueryLogDetail = {
  id: ID, userId: 'u1', username: 'alice', datasourceCode: 'ds1', querySummary: null, status: 'success', statusCode: 200,
  errorCode: null, recordCount: 1, durationMs: 10, createdAt: '2026-11-04T17:00:00.000Z', queryParams: {}, errorMessage: null,
  upstreamRequestId: null, ip: null, userAgent: null,
};
const payload: QueryLogPayloadResponse = {
  queryLogId: ID, captured: true, capturedAt: '2026-11-04T17:00:01.000Z', masked: false, clientRequest: { cccd: '0123' },
  upstreamRequest: { transport: 'http', method: 'POST', url: 'https://up.example/x', headers: { authorization: '[redacted]' }, body: { q: 1 }, attempt: 2 },
  upstreamResponse: { statusCode: 502, durationMs: 33, body: { msg: 'bad' }, error: 'Bad gateway' },
  clientResponse: { error: { code: 'UPSTREAM_ERROR', message: 'x' } },
};

function setup(permissions: string[]) {
  useAuthStore.setState({
    accessToken: 't', status: 'authenticated',
    user: { id: '1', username: 'u', fullName: 'U', email: null, mustChangePassword: false, permissions, roles: [] },
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <HistoryDetailDialog id={ID} canViewAll onOpenChange={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openTab(name: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchHistoryDetail).mockResolvedValue(detail);
  vi.mocked(api.fetchHistoryPayload).mockResolvedValue(payload);
});

describe('HistoryDetailDialog payload tabs', () => {
  it('hides the tabs and never fetches without history:view_payload', async () => {
    setup([P.HISTORY_VIEW_ALL]);
    await screen.findByText('alice');
    expect(screen.queryByRole('tab')).toBeNull();
    expect(api.fetchHistoryPayload).not.toHaveBeenCalled();
  });

  it('fetches lazily on first open of Đầu vào and shows both input blocks', async () => {
    setup([P.HISTORY_VIEW_PAYLOAD]);
    await screen.findByRole('tab', { name: 'Đầu vào' });
    expect(api.fetchHistoryPayload).not.toHaveBeenCalled();
    await openTab('Đầu vào');
    await waitFor(() => expect(api.fetchHistoryPayload).toHaveBeenCalledWith(ID));
    expect(await screen.findByText('https://up.example/x')).toBeInTheDocument();
    expect(screen.getByText(/"cccd": "0123"/)).toBeInTheDocument();
    expect(screen.getByText(/"authorization": "\[redacted\]"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sao chép.*Header/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tải .*Header.* \.json|Tải Header dạng \.json/ })).toBeInTheDocument();
  });

  it('Đầu ra shows upstream status badge, error and client response; download triggers saveBlob', async () => {
    setup([P.HISTORY_VIEW_PAYLOAD]);
    await openTab('Đầu ra');
    expect(await screen.findByText('502')).toBeInTheDocument();
    expect(screen.getByText('Bad gateway')).toBeInTheDocument();
    expect(screen.getByText(/UPSTREAM_ERROR/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tải Phản hồi trả về cho người dùng dạng .json' }));
    expect(saveBlobModule.saveBlob).toHaveBeenCalledWith(expect.any(Blob), `${ID}-client-response.json`);
  });

  it('shows the not-captured message', async () => {
    vi.mocked(api.fetchHistoryPayload).mockResolvedValue({ ...payload, captured: false, capturedAt: null, upstreamRequest: null, upstreamResponse: null, clientResponse: null });
    setup([P.HISTORY_VIEW_PAYLOAD]);
    await openTab('Đầu ra');
    expect(await screen.findByText(/Chưa lưu nội dung cho request này/)).toBeInTheDocument();
  });

  it('shows the masked notice', async () => {
    vi.mocked(api.fetchHistoryPayload).mockResolvedValue({ ...payload, masked: true });
    setup([P.HISTORY_VIEW_PAYLOAD]);
    await openTab('Đầu vào');
    expect(await screen.findByText(/không có quyền xem dữ liệu nhạy cảm/)).toBeInTheDocument();
  });

  it('shows a permission message on 403', async () => {
    vi.mocked(api.fetchHistoryPayload).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'no', ''));
    setup([P.HISTORY_VIEW_PAYLOAD]);
    await openTab('Đầu vào');
    expect(await screen.findByText(/không có quyền xem nội dung đầu vào\/đầu ra/)).toBeInTheDocument();
  });

  it('renders TruncatedMarker and ImagePlaceholder specially', async () => {
    vi.mocked(api.fetchHistoryPayload).mockResolvedValue({
      ...payload,
      upstreamResponse: { statusCode: 200, durationMs: 1, error: null, body: { $truncated: true, originalBytes: 999999, preview: '{"big":' } },
      clientResponse: { $image: true, bytes: 2048, sha256: 'abc123', mime: 'image/png' },
    });
    setup([P.HISTORY_VIEW_PAYLOAD]);
    await openTab('Đầu ra');
    expect(await screen.findByText('Đã cắt bớt: 999999 bytes gốc')).toBeInTheDocument();
    expect(screen.getByText('{"big":')).toBeInTheDocument();
    expect(screen.getByText('Ảnh: 2048 bytes, sha256 abc123, image/png')).toBeInTheDocument();
  });

  it('renders HTML in a body as inert text', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    vi.mocked(api.fetchHistoryPayload).mockResolvedValue({ ...payload, upstreamResponse: { statusCode: 200, durationMs: 1, error: null, body: evil } });
    const { container } = setup([P.HISTORY_VIEW_PAYLOAD]);
    await openTab('Đầu ra');
    expect(await screen.findByText(evil)).toBeInTheDocument();
    expect(document.body.querySelector('img')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
