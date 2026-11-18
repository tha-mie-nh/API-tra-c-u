import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function run(body: string | Record<string, unknown>, status = HttpStatus.BAD_GATEWAY) {
  const json = jest.fn();
  const response = { status: jest.fn().mockReturnValue({ json }) };
  const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ requestId: 'req-1' }) }) };
  new HttpExceptionFilter().catch(new HttpException(body, status), host as never);
  return { status: response.status.mock.calls[0][0], body: json.mock.calls[0][0].error };
}

describe('HttpExceptionFilter: upstreamStatus (mã lỗi thật của API đối tác)', () => {
  it('chuyển upstreamStatus hợp lệ về trình duyệt, HTTP status vẫn là 502', () => {
    const out = run({ error: { code: 'UPSTREAM_UNAUTHORIZED', message: 'Upstream rejected the access key (HTTP 401)', upstreamStatus: 401 } });
    expect(out.status).toBe(502);
    expect(out.body).toMatchObject({ code: 'UPSTREAM_UNAUTHORIZED', upstreamStatus: 401, requestId: 'req-1' });
  });

  it.each<[unknown, string]>([['401', 'chuỗi'], [99, 'nhỏ hơn 100'], [600, 'lớn hơn 599'], [401.5, 'không nguyên'], [{ a: 1 }, 'đối tượng']])(
    'bỏ qua giá trị không hợp lệ (%s: %s)',
    (value) => {
      expect(run({ error: { code: 'X', message: 'm', upstreamStatus: value } }).body).not.toHaveProperty('upstreamStatus');
    },
  );

  it('lỗi thường không có upstreamStatus', () => {
    expect(run({ code: 'FORBIDDEN_API', message: 'no' }, HttpStatus.FORBIDDEN).body).not.toHaveProperty('upstreamStatus');
  });
});
