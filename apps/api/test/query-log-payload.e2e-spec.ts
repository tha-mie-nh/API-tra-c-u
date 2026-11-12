import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DatasourceEntry, QueryLogPayloadResponse } from '@app/shared';
import { PrismaService } from '../src/prisma/prisma.service';
import { DatasourceRegistryService } from '../src/datasources/datasource-registry.service';
import { HttpInfoAdapter } from '../src/datasources/adapters/http-info.adapter';
import { buildInputSchema } from '../src/datasources/input-schema.builder';
import { auth, bootApp, cleanupUsers, createRoleUser, toQueryLogData, type E2eUser } from './fixtures/query-log-e2e-fixtures';

const CODE = 'E2E_IO_DS';
const API_KEY = 'SUPER-SECRET-KEY-123';
const PNG_B64 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 9)]).toString('base64');

describe('Query log payload monitor (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let server: Server;
  const suffix = Date.now();
  let admin: E2eUser & { roleId: string };
  let noPayload: E2eUser & { roleId: string };
  let queryOnly: E2eUser & { roleId: string };

  const latestLogId = async (userId: string): Promise<string> =>
    (await prisma.queryLog.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: 'desc' } })).id;
  const query = (token: string, citizenId: string) =>
    request(app.getHttpServer()).post(`/api/v1/query/${CODE}`).set(auth(token)).send({ params: { citizenId } });
  const payload = (token: string, id: string) => request(app.getHttpServer()).get(`/api/v1/history/${id}/payload`).set(auth(token));

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const body = JSON.parse(raw || '{}') as { cccd_no?: string };
        const send = (status: number, json: unknown) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(json));
        };
        switch (body.cccd_no) {
          case '4040': return send(404, { message: 'not found upstream' });
          case '5050': return send(503, { message: 'upstream down' });
          case '7070': return; // never answers -> timeout
          case 'BIG': return send(200, { data: { items: [{ so_cccd: 'BIG', ho_ten: 'Big', ts: '2024-01-01T00:00:00Z', note: 'x'.repeat(2_200_000) }] } });
          default: return send(200, { data: { items: [{ so_cccd: body.cccd_no, ho_ten: 'Nguyen A', ts: '2024-01-01T00:00:00Z', img: `data:image/png;base64,${PNG_B64}` }] } });
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const entry: DatasourceEntry = {
      code: CODE, name: 'E2E IO', type: 'info', enabled: true, permissionCode: 'api:e2e_io_ds',
      transport: { kind: 'http', baseUrl, path: '/find', method: 'POST', auth: { kind: 'apiKeyHeader', header: 'X-Api-Key', valueEnv: 'X' }, timeoutMs: 400, retry: { attempts: 1, backoffMs: 10 } },
      input: { fields: [{ name: 'citizenId', label: 'CCCD', type: 'string', required: true, mapTo: 'cccd_no' }] },
      output: {
        recordsPath: 'data.items', timestampField: 'ts', sortOrder: 'desc', identityField: 'citizenId',
        fields: [
          { name: 'citizenId', label: 'CCCD', from: 'so_cccd', type: 'string', sensitive: true },
          { name: 'fullName', label: 'Name', from: 'ho_ten', type: 'string' },
          { name: 'ts', label: 'Ts', from: 'ts', type: 'datetime' },
          { name: 'photo', label: 'Photo', from: 'img', type: 'image' },
        ],
      },
      limits: { maxResults: 10, pageSize: 5 },
    };
    ({ app, prisma } = await bootApp());
    const adapter = new HttpInfoAdapter(entry, { baseUrl, apiKeyValue: API_KEY } as never);
    const registry = app.get(DatasourceRegistryService);
    const original = registry.get.bind(registry);
    jest.spyOn(registry, 'get').mockImplementation((code: string) =>
      code === CODE ? { config: entry, adapter, inputSchema: buildInputSchema(entry.input.fields, undefined, undefined) } : original(code),
    );

    admin = await createRoleUser(app, prisma, `PAYADM_${suffix}`, ['history:view_all', 'history:view_sensitive', 'history:view_payload', 'api:e2e_io_ds']);
    noPayload = await createRoleUser(app, prisma, `PAYNO_${suffix}`, ['history:view_all', 'history:view_sensitive']);
    queryOnly = await createRoleUser(app, prisma, `PAYQ_${suffix}`, ['history:view_own', 'history:view_payload']);
  });

  afterAll(async () => {
    await prisma.queryLog.deleteMany({ where: { OR: [{ datasourceCode: CODE }, { usernameSnapshot: 'e2e_payload_row' }] } });
    await cleanupUsers(prisma, [admin, noPayload, queryOnly]);
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await app.close();
  });

  it('stores exact upstream request/response + client response; secret never stored; image placeholder', async () => {
    const res = await query(admin.token, '0123456789');
    expect(res.status).toBe(200);
    const id = await latestLogId(admin.id);
    const body = (await payload(admin.token, id)).body as QueryLogPayloadResponse;

    expect(body).toMatchObject({ captured: true, masked: false, clientRequest: { citizenId: '0123456789' } });
    expect(body.upstreamRequest).toMatchObject({ transport: 'http', method: 'POST', body: { cccd_no: '0123456789' }, attempt: 1 });
    expect(body.upstreamRequest?.headers['X-Api-Key']).toBe('[redacted]');
    expect(body.upstreamResponse).toMatchObject({ statusCode: 200, error: null });
    // exact values (no masking)
    expect(JSON.stringify(body.clientResponse)).toContain('0123456789');
    expect(JSON.stringify(body.upstreamResponse)).toContain('so_cccd');
    // images -> placeholders in stored copies, real response unchanged
    expect(JSON.stringify(body)).not.toContain(PNG_B64);
    expect(JSON.stringify(res.body)).toContain(PNG_B64);
    const raw = await prisma.queryLogPayload.findUniqueOrThrow({ where: { queryLogId: id } });
    expect(JSON.stringify(raw)).not.toContain(API_KEY);
    expect(JSON.stringify(raw.clientResponse)).toContain('"$image":true');
    expect(JSON.stringify(raw.upstreamResponse)).toContain('"$image":true');
  });

  it.each([
    ['4040', 404, 1, 'not found upstream'],
    ['5050', 503, 2, 'upstream down'],
  ])('stores upstream error body for %s', async (cccd, status, attempt, text) => {
    const res = await query(admin.token, cccd);
    expect(res.status).toBe(502);
    const body = (await payload(admin.token, await latestLogId(admin.id))).body as QueryLogPayloadResponse;
    expect(body.upstreamResponse).toMatchObject({ statusCode: status, body: { message: text } });
    expect(body.upstreamRequest?.attempt).toBe(attempt);
    expect(body.clientResponse).toMatchObject({ error: { code: 'UPSTREAM_ERROR' } });
    expect(JSON.stringify(body)).not.toContain(API_KEY);
  });

  it('stores timeout', async () => {
    const res = await query(admin.token, '7070');
    expect(res.status).toBe(504);
    const body = (await payload(admin.token, await latestLogId(admin.id))).body as QueryLogPayloadResponse;
    expect(body.upstreamResponse).toMatchObject({ statusCode: null, error: expect.stringContaining('timed out') });
    expect(body.upstreamRequest?.url).toContain('/find');
    expect(body.clientResponse).toMatchObject({ error: { code: 'UPSTREAM_TIMEOUT' } });
  });

  it('stores validation error as client response', async () => {
    const res = await request(app.getHttpServer()).post(`/api/v1/query/${CODE}`).set(auth(admin.token)).send({ params: {} });
    expect(res.status).toBe(422);
    const body = (await payload(admin.token, await latestLogId(admin.id))).body as QueryLogPayloadResponse;
    expect(body.clientResponse).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(body.upstreamRequest).toBeNull();
  });

  it('truncates oversized parts', async () => {
    const res = await query(admin.token, 'BIG');
    expect(res.status).toBe(200);
    const body = (await payload(admin.token, await latestLogId(admin.id))).body as QueryLogPayloadResponse;
    expect(body.upstreamResponse).toMatchObject({ $truncated: true, originalBytes: expect.any(Number) });
    expect(body.clientResponse).toMatchObject({ datasource: CODE });
  });

  it('records denial client response', async () => {
    const res = await query(noPayload.token, '1');
    expect(res.status).toBe(403);
    const body = (await payload(admin.token, await latestLogId(noPayload.id))).body as QueryLogPayloadResponse;
    expect(body.clientResponse).toMatchObject({ error: { code: 'FORBIDDEN_API', message: 'Access denied' } });
  });

  it('403 without history:view_payload or without view_all; 404 unknown id; audit written', async () => {
    const id = await latestLogId(admin.id);
    expect((await payload(noPayload.token, id)).status).toBe(403);
    expect((await payload(queryOnly.token, id)).status).toBe(403);
    expect((await payload(admin.token, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await payload(admin.token, id)).status).toBe(200);
    const audits = await prisma.auditLog.count({ where: { actorUserId: admin.id, action: 'query_log.view_payload' } });
    expect(audits).toBeGreaterThan(0);
  });

  it('captured:false when no payload row', async () => {
    const row = await prisma.queryLog.create({ data: toQueryLogData({ at: new Date().toISOString(), code: CODE, username: 'e2e_payload_row', params: { citizenId: '1' } }) });
    const res = await payload(admin.token, row.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ captured: false, capturedAt: null, upstreamRequest: null, clientRequest: { citizenId: '1' } });
  });
});
