import { HttpException } from '@nestjs/common';
import { z } from 'zod';
import { QueryService } from './query.service';
import { UpstreamError, UpstreamTimeoutError } from '../datasources/adapters/adapter-errors';
import type { UpstreamExchange } from '../datasources/adapters/datasource-adapter.interface';

/** Lịch sử phải ghi ĐÚNG điều đối tác trả về / điều đã xảy ra; trình duyệt chỉ nhận mã (upstreamStatus), không nhận lời của đối tác. */
const exchange = (response: Partial<UpstreamExchange['response']>, durationMs = 42): UpstreamExchange =>
  ({ request: { transport: 'http', method: 'GET', url: 'http://x/images', headers: {}, body: null, attempt: 1 }, response: { statusCode: null, durationMs, body: null, error: null, ...response } }) as UpstreamExchange;

function build(execute: () => Promise<never> | Promise<unknown>) {
  const record = jest.fn().mockResolvedValue(undefined);
  const registry = { get: () => ({ config: { code: 'DS', output: { fields: [], timestampField: 't', identityField: 'i', sortOrder: 'desc' }, limits: { maxResults: 10, pageSize: 10 } }, adapter: { execute }, inputSchema: z.object({}).strict() }) };
  const service = new QueryService(registry as never, { map: jest.fn() } as never, { record } as never);
  const run = () => service.execute({ code: 'DS', params: {}, user: { id: 'u1', username: 'u' } as never, requestId: 'r1' });
  return { run, record };
}

async function fail(err: unknown) {
  const { run, record } = build(() => Promise.reject(err));
  const thrown = await run().catch((e: HttpException) => e);
  expect(thrown).toBeInstanceOf(HttpException);
  return { logged: record.mock.calls[0]![0], clientBody: ((thrown as HttpException).getResponse() as { error: Record<string, unknown> }).error, status: (thrown as HttpException).getStatus() };
}

describe('QueryService: lịch sử ghi đúng lỗi của đối tác', () => {
  it('đối tác trả 401 kèm lời: lịch sử có mã và lời đó; trình duyệt chỉ có upstreamStatus, không có lời của đối tác', async () => {
    const out = await fail(new UpstreamError('x', 'DS', undefined, exchange({ statusCode: 401, body: { message: 'Invalid access key' } })));
    expect(out.logged).toMatchObject({ errorCode: 'UPSTREAM_UNAUTHORIZED', statusCode: 401, errorMessage: 'Đối tác trả lỗi HTTP 401: Invalid access key' });
    expect(out.clientBody).toMatchObject({ code: 'UPSTREAM_UNAUTHORIZED', upstreamStatus: 401 });
    expect(JSON.stringify(out.clientBody)).not.toContain('Invalid access key');
    expect(out.status).toBe(502);
  });

  it('đối tác trả 500: lịch sử nêu 500 và lời đối tác', async () => {
    const out = await fail(new UpstreamError('x', 'DS', undefined, exchange({ statusCode: 500, body: { error: 'database down' } })));
    expect(out.logged).toMatchObject({ errorCode: 'UPSTREAM_ERROR', statusCode: 500, errorMessage: 'Đối tác trả lỗi HTTP 500: database down' });
    expect(out.clientBody).toMatchObject({ upstreamStatus: 500 });
  });

  it('không kết nối được: lịch sử nêu nguyên nhân thật (ECONNREFUSED), không có upstreamStatus', async () => {
    const out = await fail(new UpstreamError('x', 'DS', undefined, exchange({ error: 'network error: connect ECONNREFUSED 10.0.0.5:8080' })));
    expect(out.logged.errorMessage).toBe('Không kết nối được tới đối tác: connect ECONNREFUSED 10.0.0.5:8080');
    expect(out.logged.statusCode).toBe(502); // không có mã của đối tác -> mã hệ thống
    expect(out.clientBody).not.toHaveProperty('upstreamStatus');
  });

  it('quá thời gian: 504, lịch sử nêu lý do', async () => {
    const out = await fail(new UpstreamTimeoutError('DS: timed out after 3000ms', 'DS', exchange({ error: 'DS: timed out after 3000ms' }, 3000)));
    expect(out.status).toBe(504);
    expect(out.logged).toMatchObject({ errorCode: 'UPSTREAM_TIMEOUT', statusCode: 504, errorMessage: 'Đối tác không phản hồi: DS: timed out after 3000ms' });
  });

  it('phản hồi 2xx nhưng không đọc được: lịch sử nêu nguyên nhân thật thay vì câu chung', async () => {
    const out = await fail(new SyntaxError('Unexpected token < in JSON at position 0'));
    expect(out.logged.errorMessage).toBe('Không xử lý được phản hồi của đối tác: Unexpected token < in JSON at position 0');
  });

  it('thời gian phản hồi của đối tác được truyền xuống để ghi (exchange có durationMs)', async () => {
    const out = await fail(new UpstreamError('x', 'DS', undefined, exchange({ statusCode: 401, body: null }, 87)));
    expect(out.logged.exchange.response.durationMs).toBe(87);
  });
});
