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

// Single shared /find endpoint, distinguished by X-Request-Type — matches
// the REAL "spec upstream" shape documented in .env.example for
// IMMIGRATION_HISTORY/PASSPORT_INFO/DRIVER_LICENSE/FACE_PHOTO (all currently
// transport.kind:"mock" in config.json; this endpoint is what you point
// `Base URL` at when flipping one of them to "HTTP (API thật)" for a demo
// against something real). Response envelope ({"data":[{"data":[...]}]})
// matches those 4 datasources' output.recordsPath = "data.0.data" exactly —
// field names below match their output.fields[].from, not the mock-data
// fixtures (different key names on purpose, same as the real spec).
const FIND_RECORDS = {
  'find-immihistory': [
    {
      hoTen: 'Nguyễn Văn A',
      ngaySinh: '1999-05-12',
      defNgaySinh: 'D',
      gioiTinh: 'M',
      soHoChieu: 'E00123456',
      loaiHoChieu: 'PT',
      hanHoChieu: '2029-05-12',
      noiCapHoChieu: 'Cục Quản lý xuất nhập cảnh',
      quocTich: 'Việt Nam',
      xuatNhap: 'X',
      ngayXuatNhap: '2026-01-15T09:30:00Z',
      cuaKhau: 'Sân bay Nội Bài',
      mucDich: 'Du lịch',
    },
  ],
  'find-passport': [
    {
      hoTen: 'Nguyễn Văn A',
      ngaySinh: '1999-05-12',
      gioiTinh: 'M',
      soHoChieu: 'E00123456',
      ngayCapHoChieu: '2024-05-12',
      hanHoChieu: '2029-05-12',
      noiCapHoChieu: 'Cục Quản lý xuất nhập cảnh',
      trangThai: '1',
    },
  ],
  'find-driverlicense': [
    { soCCCD: '001099001234', soGplx: '010123456789', ngaySinh: '1999-05-12', hangGPLX: 'B2', ngayCap: '2020-03-01' },
  ],
};

function checkAuth(req, res, requireReqType) {
  if (req.headers['x-access'] !== API_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid or missing X-Access header' }));
    return false;
  }
  if (requireReqType && req.headers['x-reqtype'] !== REQ_TYPE) {
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
    if (!checkAuth(req, res, true)) return;
    const body = await readJsonBody(req).catch(() => ({}));
    const items = MST_RECORDS.filter((r) => !body.mst || r.mst === body.mst);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { items, total: items.length } }));
    return;
  }

  if (url.pathname === '/tra-cuu/giay-phep-kinh-doanh' && req.method === 'POST') {
    if (!checkAuth(req, res, true)) return;
    const body = await readJsonBody(req).catch(() => ({}));
    const items = GPKD_RECORDS.filter((r) => !body.soGPKD || r.soGPKD === body.soGPKD);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { items, total: items.length } }));
    return;
  }

  // Shared /find endpoint for the 4 real-spec datasources — auth header
  // only (X-Request-Type picks the dataset, not a fixed value like X-ReqType
  // above), matching .env.example's documented real-world shape exactly.
  if (url.pathname === '/find' && req.method === 'POST') {
    if (!checkAuth(req, res, false)) return;
    const reqType = req.headers['x-request-type'];
    const data = FIND_RECORDS[reqType];
    if (!data) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `unknown or missing X-Request-Type: "${reqType}"` }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ data }] }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`[mock-upstream] listening on http://localhost:${PORT}`);
  console.log(`[mock-upstream] POST /tra-cuu/ma-so-thue              { "mst": "0101234567" }`);
  console.log(`[mock-upstream] POST /tra-cuu/giay-phep-kinh-doanh  { "soGPKD": "GP-2024-001122" }`);
  console.log(`[mock-upstream] POST /find  (X-Request-Type: find-immihistory|find-passport|find-driverlicense)`);
  console.log(`[mock-upstream] requires headers: X-Access: ${API_KEY}   X-ReqType: ${REQ_TYPE} (only on the first 2 routes)`);
});
