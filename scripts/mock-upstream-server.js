#!/usr/bin/env node
// Standalone fake "real" upstream API server — demo-only, never part of any
// deployed image. Purpose: every datasource in config/config.json so far
// uses transport.kind:"mock" (reads a local JSON fixture) — none actually
// exercises the transport.kind:"http" path (real baseUrl/path/headers/auth
// over the network). This server gives that path something real to call,
// so an admin can see exactly how to fill in Base URL / Đường dẫn / Headers
// / Xác thực when wiring a genuinely new upstream API — including the
// custom-header pattern (X-Access, X-ReqType) leader asked about.
//
// Usage: node scripts/mock-upstream-server.js
// Port:    MOCK_UPSTREAM_PORT (default 4100)
// API key: MOCK_UPSTREAM_API_KEY (default "demo-mst-secret-123") — must match
//          whatever datasource.transport.auth.valueEnv resolves to.
const http = require('node:http');
const { URL } = require('node:url');

const PORT = process.env.MOCK_UPSTREAM_PORT || 4100;
const API_KEY = process.env.MOCK_UPSTREAM_API_KEY || 'demo-mst-secret-123';
const REQ_TYPE = 'LOOKUP';

// "Mã số thuế" (tax code) lookup — POST with a JSON body (the api/datasource
// HTTP adapter only sends params via a POST body, never as a GET query
// string — see http-info.adapter.ts's callOnce()). Nested response shape
// (recordsPath = "data.items") to demo extracting records out of an
// envelope, not just a bare array like the mock fixtures use.
const MST_RECORDS = [
  { mst: '0101234567', tenDoanhNghiep: 'Công ty TNHH Công nghệ ABC', diaChi: '12 Láng Hạ, Đống Đa, Hà Nội', trangThai: '1', ngayCapNhat: '2026-02-01T08:00:00Z' },
  { mst: '0109876543', tenDoanhNghiep: 'Công ty CP Thương mại XYZ', diaChi: '45 Nguyễn Huệ, Quận 1, TP.HCM', trangThai: '2', ngayCapNhat: '2025-11-15T08:00:00Z' },
];

// "Giấy phép kinh doanh" (business license) lookup — POST with a JSON body.
const GPKD_RECORDS = [
  { soGPKD: 'GP-2024-001122', tenDoanhNghiep: 'Công ty TNHH Công nghệ ABC', nganhNghe: 'Dịch vụ công nghệ thông tin', ngayCap: '2024-05-10T00:00:00Z' },
];

function checkAuth(req, res) {
  if (req.headers['x-access'] !== API_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid or missing X-Access header' }));
    return false;
  }
  if (req.headers['x-reqtype'] !== REQ_TYPE) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `X-ReqType header must be "${REQ_TYPE}"` }));
    return false;
  }
  return true;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/tra-cuu/ma-so-thue' && req.method === 'POST') {
    if (!checkAuth(req, res)) return;
    const body = await readJsonBody(req).catch(() => ({}));
    const items = MST_RECORDS.filter((r) => !body.mst || r.mst === body.mst);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { items, total: items.length } }));
    return;
  }

  if (url.pathname === '/tra-cuu/giay-phep-kinh-doanh' && req.method === 'POST') {
    if (!checkAuth(req, res)) return;
    const body = await readJsonBody(req).catch(() => ({}));
    const items = GPKD_RECORDS.filter((r) => !body.soGPKD || r.soGPKD === body.soGPKD);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { items, total: items.length } }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`[mock-upstream] listening on http://localhost:${PORT}`);
  console.log(`[mock-upstream] POST /tra-cuu/ma-so-thue              { "mst": "0101234567" }`);
  console.log(`[mock-upstream] POST /tra-cuu/giay-phep-kinh-doanh  { "soGPKD": "GP-2024-001122" }`);
  console.log(`[mock-upstream] requires headers: X-Access: ${API_KEY}   X-ReqType: ${REQ_TYPE}`);
});
