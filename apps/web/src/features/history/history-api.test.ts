import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError, apiFetch } from '@/lib/api-client';
import { fetchHistoryDetail } from './history-api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiFetch: vi.fn(() => Promise.resolve({})) };
});

beforeEach(() => vi.clearAllMocks());

describe('fetchHistoryDetail', () => {
  it.each(['../admin/users', 'abc', '', '11111111-1111-4111-8111-11111111111?x=1'])('rejects %p as 404 without calling the API', async (id) => {
    await expect(fetchHistoryDetail(id)).rejects.toMatchObject({ status: 404 });
    await expect(fetchHistoryDetail(id)).rejects.toBeInstanceOf(ApiError);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('calls /history/:uuid for a valid id', async () => {
    await fetchHistoryDetail('11111111-1111-4111-8111-111111111111');
    expect(apiFetch).toHaveBeenCalledWith('/history/11111111-1111-4111-8111-111111111111');
  });
});
