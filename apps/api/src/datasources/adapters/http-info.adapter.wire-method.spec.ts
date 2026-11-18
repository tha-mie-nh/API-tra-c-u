import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatasourceEntry } from '@app/shared';
import { HttpInfoAdapter } from './http-info.adapter';

/** Chứng minh method MÀ ĐỐI TÁC THỰC SỰ NHẬN trên đường truyền = `transport.method`, không phải POST của endpoint /query nội bộ. */
interface Seen { method?: string; url?: string; body: string; headers: IncomingMessage['headers'] }

function entry(method: 'GET' | 'POST', baseUrl: string, fields: object[]): DatasourceEntry {
  return {
    code: 'WIRE', name: 'wire', type: 'info', enabled: true, permissionCode: 'api:wire', input: { fields },
    output: { timestampField: 'ts', sortOrder: 'desc', identityField: 'id', fields: [{ name: 'id', label: 'id', type: 'string' }, { name: 'ts', label: 'ts', type: 'string' }] },
    transport: { kind: 'http', baseUrl, path: '/images', method, auth: { kind: 'apiKeyHeader', header: 'X-Access-Key' }, retry: { attempts: 0, backoffMs: 1 }, timeoutMs: 3000 },
    limits: { maxResults: 10, pageSize: 10 },
  } as unknown as DatasourceEntry;
}

describe('HttpInfoAdapter: method thật trên đường truyền', () => {
  let server: Server;
  let baseUrl: string;
  let seen: Seen[];

  beforeAll(async () => {
    seen = [];
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, body, headers: req.headers });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify([{ id: '1', ts: 'x' }]));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => (seen.length = 0));

  const fields = [{ name: 'count', label: 'count', type: 'number' }, { name: 'param1', label: 'p', type: 'string' }];

  it('GET đã cấu hình: đối tác nhận GET, tham số nằm trên query string, KHÔNG có body', async () => {
    await new HttpInfoAdapter(entry('GET', baseUrl, fields), { baseUrl, apiKeyValue: 'k' }).execute({ params: { count: 2, param1: 'a' }, requestId: 'r1' });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('GET');
    expect(seen[0]?.url).toBe('/images?count=2&param1=a');
    expect(seen[0]?.body).toBe('');
    expect(seen[0]?.headers['x-access-key']).toBe('k');
  });

  it('POST đã cấu hình: đối tác nhận POST, tham số nằm trong body JSON', async () => {
    await new HttpInfoAdapter(entry('POST', baseUrl, fields), { baseUrl, apiKeyValue: 'k' }).execute({ params: { count: 2, param1: 'a' } });
    expect(seen[0]?.method).toBe('POST');
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({ count: 2, param1: 'a' });
  });
});
