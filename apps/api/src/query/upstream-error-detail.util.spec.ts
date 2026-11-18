import type { UpstreamExchange } from '../datasources/adapters/datasource-adapter.interface';
import { describeUpstreamFailure, summarizeUpstreamErrorBody } from './upstream-error-detail.util';

const ex = (response: Partial<UpstreamExchange['response']>): UpstreamExchange =>
  ({ request: {} as never, response: { statusCode: null, durationMs: 5, body: null, error: null, ...response } }) as UpstreamExchange;

describe('summarizeUpstreamErrorBody', () => {
  it.each([
    [{ message: 'Invalid access key' }, 'Invalid access key'],
    [{ error: 'unauthorized' }, 'unauthorized'],
    [{ error: { code: 'E1', message: 'Key expired' } }, 'Key expired'],
    [{ detail: 'Not found', status: 404 }, 'Not found'],
    ['Plain text error', 'Plain text error'],
    ['<html><body><h1>502 Bad Gateway</h1></body></html>', '502 Bad Gateway'],
  ])('%j -> %s', (body, expected) => expect(summarizeUpstreamErrorBody(body)).toBe(expected));

  it('không có khóa quen thuộc: trả JSON rút gọn; rỗng: null; dài: cắt', () => {
    expect(summarizeUpstreamErrorBody({ code: 7 })).toBe('{"code":7}');
    expect(summarizeUpstreamErrorBody(null)).toBeNull();
    expect(summarizeUpstreamErrorBody('')).toBeNull();
    expect(summarizeUpstreamErrorBody('x'.repeat(1000))!.length).toBeLessThanOrEqual(301);
  });
});

describe('describeUpstreamFailure', () => {
  it('đối tác trả lỗi: nêu mã HTTP và đúng lời đối tác', () => {
    expect(describeUpstreamFailure(ex({ statusCode: 401, body: { message: 'Invalid access key' } }))).toBe('Đối tác trả lỗi HTTP 401: Invalid access key');
    expect(describeUpstreamFailure(ex({ statusCode: 503, body: null }))).toBe('Đối tác trả lỗi HTTP 503');
  });
  it('không kết nối được: nêu nguyên nhân thật', () => {
    expect(describeUpstreamFailure(ex({ error: 'network error: connect ECONNREFUSED 10.0.0.5:8080' }))).toBe('Không kết nối được tới đối tác: connect ECONNREFUSED 10.0.0.5:8080');
  });
  it('quá thời gian: nêu lý do; chưa có thông tin: null', () => {
    expect(describeUpstreamFailure(ex({ error: 'WIRE: timed out after 3000ms' }))).toBe('Đối tác không phản hồi: WIRE: timed out after 3000ms');
    expect(describeUpstreamFailure(ex({ error: 'no response received yet' }))).toBeNull();
    expect(describeUpstreamFailure(undefined)).toBeNull();
  });
});
