import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { queryErrorMessage } from './query-error-message';

describe('queryErrorMessage: lỗi do API đối tác', () => {
  it('đối tác trả 401: nói đúng mã 401 (không phải 502 của API mình) kèm gợi ý về API key', () => {
    const error = new ApiError(502, 'UPSTREAM_UNAUTHORIZED', 'Upstream rejected the access key (HTTP 401)', 'r1', undefined, 401);
    const message = queryErrorMessage(error);
    expect(message).toContain('401');
    expect(message).toContain('API key');
    expect(message).not.toContain('502');
  });

  it('đối tác trả 403, 404, 500: nói đúng từng mã', () => {
    expect(queryErrorMessage(new ApiError(502, 'UPSTREAM_UNAUTHORIZED', 'x', 'r', undefined, 403))).toContain('403');
    expect(queryErrorMessage(new ApiError(502, 'UPSTREAM_ERROR', 'x', 'r', undefined, 404))).toContain('404');
    expect(queryErrorMessage(new ApiError(502, 'UPSTREAM_ERROR', 'x', 'r', undefined, 500))).toContain('500');
  });

  it('không có mã của đối tác (timeout, mất kết nối): giữ câu chung, không bịa ra mã', () => {
    expect(queryErrorMessage(new ApiError(504, 'UPSTREAM_TIMEOUT', 'x', 'r'))).not.toMatch(/\d{3}/);
    expect(queryErrorMessage(new ApiError(502, 'UPSTREAM_ERROR', 'x', 'r'))).not.toMatch(/\d{3}/);
  });
});
