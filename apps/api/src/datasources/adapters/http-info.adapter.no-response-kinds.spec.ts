import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatasourceEntry } from '@app/shared';
import { HttpInfoAdapter } from './http-info.adapter';
import { UpstreamError, UpstreamTimeoutError } from './adapter-errors';

/** "Không phản hồi" có nhiều kiểu; mỗi kiểu phải ra đúng loại lỗi (504 = quá thời gian, 502 = đối tác trả lỗi/không kết nối được). */
function entry(baseUrl: string, timeoutMs: number, attempts: number): DatasourceEntry {
  return {
    code: 'NR', name: 'nr', type: 'info', enabled: true, permissionCode: 'api:nr', input: { fields: [] },
    output: { timestampField: 'ts', sortOrder: 'desc', identityField: 'id', fields: [{ name: 'id', label: 'id', type: 'string' }, { name: 'ts', label: 'ts', type: 'string' }] },
    transport: { kind: 'http', baseUrl, path: '/x', method: 'GET', retry: { attempts, backoffMs: 20 }, timeoutMs },
    limits: { maxResults: 10, pageSize: 10 },
  } as unknown as DatasourceEntry;
}
const run = (baseUrl: string, timeoutMs: number, attempts: number) =>
  new HttpInfoAdapter(entry(baseUrl, timeoutMs, attempts), { baseUrl }).execute({ params: {} }).then(
    () => ({ kind: 'ok' as const }),
    (e: unknown) => ({ kind: e instanceof UpstreamTimeoutError ? ('timeout' as const) : e instanceof UpstreamError ? ('upstream' as const) : ('other' as const), err: e as { exchange?: { response: { statusCode: number | null; error: string | null } } } }),
  );

describe('HttpInfoAdapter: các kiểu "đối tác không phản hồi"', () => {
  let hang: Server, drop: Server;
  let hangUrl: string, dropUrl: string;
  beforeAll(async () => {
    hang = createServer(() => undefined); // nhận request, không bao giờ trả lời
    drop = createServer((req) => req.socket.destroy()); // cắt kết nối ngay
    await Promise.all([hang, drop].map((s) => new Promise<void>((r) => s.listen(0, '127.0.0.1', r))));
    hangUrl = `http://127.0.0.1:${(hang.address() as AddressInfo).port}`;
    dropUrl = `http://127.0.0.1:${(drop.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    hang.closeAllConnections();
    await Promise.all([hang, drop].map((s) => new Promise((r) => s.close(r))));
  });

  it('treo, không trả lời -> QUÁ THỜI GIAN (504), kể cả khi có retry', async () => {
    const started = Date.now();
    const out = await run(hangUrl, 500, 1);
    expect(out.kind).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(1500); // không bị kéo dài theo số lần retry
  });

  it('cổng đóng (từ chối kết nối) -> lỗi đối tác (502), nêu ECONNREFUSED', async () => {
    const out = await run('http://127.0.0.1:1', 2000, 0);
    expect(out.kind).toBe('upstream');
    expect(JSON.stringify((out as { err: unknown }).err ? (out as { err: { exchange?: unknown } }).err.exchange : '')).toContain('ECONNREFUSED');
  });

  it('server cắt kết nối giữa chừng -> lỗi đối tác (502)', async () => {
    expect((await run(dropUrl, 2000, 1)).kind).toBe('upstream');
  });

  it('tên miền không tồn tại -> lỗi đối tác (502)', async () => {
    expect((await run('http://doi-tac-khong-ton-tai.invalid', 2000, 0)).kind).toBe('upstream');
  });
});
