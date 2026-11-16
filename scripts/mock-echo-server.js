#!/usr/bin/env node
/**
 * Mock "echo" upstream, for tracing the app's request/response transactions.
 * ANY method + path answers 200 with a default record and an `echo` block that
 * mirrors exactly what arrived (method, URL, query string, headers, JSON body):
 *
 *   { "requestId": "...", "total": 1,
 *     "data": { "items": [ { ...DEFAULT_RECORD, ...query, ...body } ] },
 *     "echo": { "method", "url", "path", "query", "headers", "body" } }
 *
 * Point a datasource at it (`recordsPath: "data.items"`, `totalPath: "total"`,
 * `requestIdPath: "requestId"`): the result table shows the values you sent, and
 * the server prints one line per request/response, so you can see whether the app
 * really sent the request and with which query/body. Credential-like headers are redacted.
 *
 * Env: PORT (default 4200), MOCK_ECHO_RESPONSE (path to a JSON file overriding the default record),
 *      MOCK_ECHO_DELAY_MS (artificial latency), MOCK_ECHO_STATUS (force a status, e.g. 500, to test errors),
 *      MOCK_ECHO_FAIL_FIRST (number: the first N requests fail with MOCK_ECHO_FAIL_MODE=reset|503 — emulates a flaky
 *      upstream / stale keep-alive socket, to test retries; default mode reset = socket destroyed, no response).
 */
const http = require('node:http');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { URL } = require('node:url');
const { Buffer } = require('node:buffer');
const { setTimeout } = require('node:timers');

const PORT = Number(process.env.PORT ?? 4200);
const DELAY_MS = Number(process.env.MOCK_ECHO_DELAY_MS ?? 0);
const FORCED_STATUS = process.env.MOCK_ECHO_STATUS ? Number(process.env.MOCK_ECHO_STATUS) : undefined;
const FAIL_FIRST = Number(process.env.MOCK_ECHO_FAIL_FIRST ?? 0);
const FAIL_MODE = process.env.MOCK_ECHO_FAIL_MODE ?? 'reset';
let seen = 0;
const SECRET_HEADER = /key|token|authorization|secret|cookie|access/i;

const DEFAULT_RECORD = process.env.MOCK_ECHO_RESPONSE
  ? JSON.parse(fs.readFileSync(process.env.MOCK_ECHO_RESPONSE, 'utf8'))
  : { cccd: '001099001234', ho_ten: 'Nguyễn Văn Mock', ngay_sinh: '1999-05-12', gioi_tinh: 'M', thoi_diem: new Date().toISOString() };

function stamp() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '').replace('.', ',');
}
const log = (level, message) => console.log(`${stamp()} - ${level} - mock-echo - ${message}`);

function redact(headers) {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, SECRET_HEADER.test(k) ? '[redacted]' : v]));
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const requestId = req.headers['x-request-id'] || randomUUID();
    const url = new URL(req.url ?? '/', 'http://mock');
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let body = null;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }
    const query = Object.fromEntries(url.searchParams.entries());
    log('INFO', `--> ${req.method} ${url.pathname}${url.search} requestId=${requestId} body=${rawBody || '-'}`);

    seen += 1;
    if (seen <= FAIL_FIRST) {
      log('WARN', `<-- simulated failure (${FAIL_MODE}) for request #${seen}/${FAIL_FIRST} requestId=${requestId}`);
      if (FAIL_MODE === 'reset') return req.socket.destroy();
      res.writeHead(503, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: 'MOCK_FLAKY', message: 'simulated 503' } }));
    }
    const status = FORCED_STATUS ?? 200;
    const payload =
      status >= 400
        ? { error: { code: 'MOCK_FORCED_ERROR', message: `forced status ${status}`, requestId } }
        : {
            requestId,
            total: 1,
            data: { items: [{ ...DEFAULT_RECORD, ...query, ...(body && typeof body === 'object' ? body : {}) }] },
            echo: { method: req.method, url: req.url, path: url.pathname, query, headers: redact(req.headers), body },
          };
    setTimeout(() => {
      const text = JSON.stringify(payload);
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId });
      res.end(text);
      log(status >= 400 ? 'WARN' : 'INFO', `<-- ${status} ${req.method} ${url.pathname} ${text.length}B requestId=${requestId}`);
    }, DELAY_MS);
  });
});

server.listen(PORT, () => log('INFO', `listening on http://0.0.0.0:${PORT} (any method/path echoes the request)`));
