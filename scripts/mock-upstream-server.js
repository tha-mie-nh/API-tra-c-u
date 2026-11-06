#!/usr/bin/env node
// Standalone fake "real" upstream API server — demo-only, never part of any
// deployed image. Every datasource in config/config.json uses
// transport.kind:"http" and points here (no static mock-data file
// mechanism exists anymore) — this server is what actually answers those
// calls, with real demo data so query results have content to show.
//
// Usage: node scripts/mock-upstream-server.js
// Port:    MOCK_UPSTREAM_PORT (default 4100)
// API key: MOCK_UPSTREAM_API_KEY (default "demo-mst-secret-123") — must match
//          whatever datasource.transport.auth.valueEnv resolves to.
//
// Demo citizen used across CITIZEN_*/XUAT_NHAP_CANH/CCCD_HISTORY/
// VEHICLE_OWNERSHIP/FAMILY_EVENTS/FACE_PHOTO so one CCCD ("001099001234")
// returns a result on every one of those datasources in a live demo.
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
// Date/datetime fields here are DD/MM/YYYY[ HH:mm:ss] on purpose — confirmed
// against a real customer curl sample for this vendor's /find endpoint
// (NOT ISO 8601). config.json declares output.fields[].format:
// "DD/MM/YYYY"/"DD/MM/YYYY HH:mm:ss" on every date/datetime field of these
// 3 datasources so ResponseMapperService normalizes it server-side — keep
// this mock data in the same non-ISO shape so the demo actually exercises
// that normalization path, not just a shape it happens to already handle.
const FIND_RECORDS = {
  'find-immihistory': [
    {
      hoTen: 'Nguyễn Văn A',
      ngaySinh: '12/05/1999',
      defNgaySinh: 'D',
      gioiTinh: 'M',
      soHoChieu: 'E00123456',
      loaiHoChieu: 'PT',
      hanHoChieu: '12/05/2029',
      noiCapHoChieu: 'Cục Quản lý xuất nhập cảnh',
      quocTich: 'Việt Nam',
      xuatNhap: 'X',
      ngayXuatNhap: '15/01/2026 09:30:00',
      cuaKhau: 'Sân bay Nội Bài',
      mucDich: 'Du lịch',
    },
    {
      hoTen: 'Nguyễn Văn A',
      ngaySinh: '12/05/1999',
      defNgaySinh: 'D',
      gioiTinh: 'M',
      soHoChieu: 'E00123456',
      loaiHoChieu: 'PT',
      hanHoChieu: '12/05/2029',
      noiCapHoChieu: 'Cục Quản lý xuất nhập cảnh',
      quocTich: 'Việt Nam',
      xuatNhap: 'N',
      ngayXuatNhap: '02/02/2026 14:10:00',
      cuaKhau: 'Sân bay Nội Bài',
      mucDich: 'Du lịch',
    },
  ],
  'find-passport': [
    {
      hoTen: 'Nguyễn Văn A',
      ngaySinh: '12/05/1999',
      gioiTinh: 'M',
      soHoChieu: 'E00123456',
      ngayCapHoChieu: '12/05/2024',
      hanHoChieu: '12/05/2029',
      noiCapHoChieu: 'Cục Quản lý xuất nhập cảnh',
      trangThai: '1',
    },
  ],
  'find-driverlicense': [
    { soCCCD: '001099001234', soGplx: '010123456789', ngaySinh: '12/05/1999', hangGPLX: 'B2', ngayCap: '01/03/2020' },
  ],
};

// Demo records for the 8 datasources that don't share the /find envelope —
// each gets its own /tra-cuu/* route (same auth pattern as MST/GPKD:
// X-Access + X-ReqType: LOOKUP), returning {"data": [...]} (recordsPath:
// "data" on all 8 in config.json). Field keys match output.fields[].from
// exactly (response-mapper.service.ts reads record[field.from] directly,
// no nested path).
const CITIZEN_BASIC_RECORDS = [
  { cccd: '001099001234', ho_ten: 'Nguyễn Văn A', ngay_sinh: '1999-05-12', gioi_tinh: '1', dia_chi: '12 Láng Hạ, Đống Đa, Hà Nội', thoi_diem: '2026-01-10T08:00:00Z' },
];
const CITIZEN_EXTENDED_RECORDS = [
  { so_cccd: '001099001234', ho_va_ten: 'Nguyễn Văn A', nam_sinh: 1999, nghe_nghiep: 'Kỹ sư phần mềm', noi_o_hien_tai: '12 Láng Hạ, Đống Đa, Hà Nội', ngay_cap_nhat: '2026-02-01T08:00:00Z' },
];
const CITIZEN_RESIDENCE_RECORDS = [
  { citizen_id: '001099001234', full_name: 'Nguyễn Văn A', ho_khau_so: 'HK-001234', dia_chi_thuong_tru: '12 Láng Hạ, Đống Đa, Hà Nội', loai_dang_ky: 'TT', ngay_dang_ky: '2020-06-15T00:00:00Z' },
];
const XUAT_NHAP_CANH_RECORDS = [
  { so_cccd: '001099001234', ho_ten: 'Nguyễn Văn A', chieu: 'XUAT', cua_khau: 'Sân bay Nội Bài', quoc_gia: 'Nhật Bản', muc_dich: 'Du lịch', thoi_diem: '2026-01-15T09:30:00Z' },
];
const CCCD_HISTORY_RECORDS = [
  { so_cccd: '001099001234', ho_ten: 'Nguyễn Văn A', loai_giay_to: 'CCCD_CHIP', so_giay_to: '001099001234', tuoi_luc_cap: 25, chieu_cao: 170, dac_diem_nhan_dang: 'Không có', noi_cap: 'Cục Cảnh sát QLHC về TTXH', ngay_cap: '2024-03-10T00:00:00Z' },
];
const VEHICLE_OWNERSHIP_RECORDS = [
  { so_cccd: '001099001234', chu_so_huu: 'Nguyễn Văn A', loai_xe: 'O_TO', hang_xe: 'Toyota', dong_xe: 'Vios', bien_so: '30A-123.45', gia_tri: 550000000, noi_dang_ky: 'Phòng CSGT Hà Nội', ngay_dang_ky: '2023-07-20T00:00:00Z' },
];
const FAMILY_EVENTS_RECORDS = [
  { so_cccd: '001099001234', ho_ten: 'Nguyễn Văn A', loai_su_kien: 'KET_HON', quan_he: 'Vợ/chồng', nguoi_lien_quan: 'Trần Thị B', cccd_nguoi_lien_quan: '001099005678', noi_dang_ky: 'UBND phường Láng Hạ', ngay_su_kien: '2022-11-01T00:00:00Z' },
];
// 1x1 transparent PNG — stands in for a real base64 photo (every real
// upstream in this project returns images this way, never a bucket ref).
const DEMO_PHOTO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUAAarVyFEAAAAASUVORK5CYII=';
const FACE_PHOTO_RECORDS = [
  { soCCCD: '001099001234', hinhAnh: DEMO_PHOTO_BASE64, created_at: '2026-01-10T08:00:00Z' },
];

// path, records, idField, header name for each /tra-cuu/* route below.
// FACE_PHOTO shares the real-spec vendor (X-Access-Key) with the /find
// group; the citizen/CCCD ones are the separate no-real-sample-yet group
// (X-Access).
const SIMPLE_ROUTES = [
  { path: '/tra-cuu/cong-dan-co-ban', records: CITIZEN_BASIC_RECORDS, idField: 'cccd', headerName: 'x-access' },
  { path: '/tra-cuu/cong-dan-mo-rong', records: CITIZEN_EXTENDED_RECORDS, idField: 'so_cccd', headerName: 'x-access' },
  { path: '/tra-cuu/cu-tru', records: CITIZEN_RESIDENCE_RECORDS, idField: 'citizen_id', headerName: 'x-access' },
  { path: '/tra-cuu/xuat-nhap-canh', records: XUAT_NHAP_CANH_RECORDS, idField: 'so_cccd', headerName: 'x-access' },
  { path: '/tra-cuu/lich-su-cccd', records: CCCD_HISTORY_RECORDS, idField: 'so_cccd', headerName: 'x-access' },
  { path: '/tra-cuu/phuong-tien', records: VEHICLE_OWNERSHIP_RECORDS, idField: 'so_cccd', headerName: 'x-access' },
  { path: '/tra-cuu/ho-tich', records: FAMILY_EVENTS_RECORDS, idField: 'so_cccd', headerName: 'x-access' },
  { path: '/tra-cuu/anh-mat', records: FACE_PHOTO_RECORDS, idField: 'soCCCD', headerName: 'x-access-key' },
];

// `headerName` must match each datasource's `transport.auth.header` in
// config.json EXACTLY (case-insensitive is fine, Node lower-cases incoming
// header names) — confirmed against a real customer curl sample for the
// /find group: they use "X-Access-Key", NOT "X-Access". The MST/GPKD demo
// routes are a separate fictional vendor with no real sample yet, so they
// keep "X-Access" until a real spec says otherwise.
function checkAuth(req, res, { requireReqType = false, headerName = 'x-access' } = {}) {
  if (req.headers[headerName] !== API_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `invalid or missing ${headerName} header` }));
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
    if (!checkAuth(req, res, { requireReqType: true })) return;
    const body = await readJsonBody(req).catch(() => ({}));
    const items = MST_RECORDS.filter((r) => !body.mst || r.mst === body.mst);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { items, total: items.length } }));
    return;
  }

  if (url.pathname === '/tra-cuu/giay-phep-kinh-doanh' && req.method === 'POST') {
    if (!checkAuth(req, res, { requireReqType: true })) return;
    const body = await readJsonBody(req).catch(() => ({}));
    const items = GPKD_RECORDS.filter((r) => !body.soGPKD || r.soGPKD === body.soGPKD);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { items, total: items.length } }));
    return;
  }

  const simpleRoute = SIMPLE_ROUTES.find((r) => r.path === url.pathname);
  if (simpleRoute && req.method === 'POST') {
    if (!checkAuth(req, res, { requireReqType: true, headerName: simpleRoute.headerName })) return;
    const body = await readJsonBody(req).catch(() => ({}));
    const filterValue = body[simpleRoute.idField];
    const data = simpleRoute.records.filter((r) => !filterValue || r[simpleRoute.idField] === filterValue);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data }));
    return;
  }

  // Shared /find endpoint for the 3 real-spec datasources — X-Access-Key
  // only (X-Request-Type picks the dataset, not a fixed value like X-ReqType
  // above). Envelope ({code,data:[{data,errorDescription}],message,status})
  // matches a real customer curl sample for this vendor exactly.
  if (url.pathname === '/find' && req.method === 'POST') {
    if (!checkAuth(req, res, { headerName: 'x-access-key' })) return;
    const reqType = req.headers['x-request-type'];
    const data = FIND_RECORDS[reqType];
    if (!data) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `unknown or missing X-Request-Type: "${reqType}"` }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 200, data: [{ data, errorDescription: '' }], message: 'OK', status: 200 }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`[mock-upstream] listening on http://localhost:${PORT}`);
  console.log(`[mock-upstream] POST /tra-cuu/ma-so-thue              { "mst": "0101234567" }`);
  console.log(`[mock-upstream] POST /tra-cuu/giay-phep-kinh-doanh  { "soGPKD": "GP-2024-001122" }`);
  for (const r of SIMPLE_ROUTES) {
    console.log(`[mock-upstream] POST ${r.path}  { "${r.idField}": "001099001234" }`);
  }
  console.log(`[mock-upstream] POST /find  (X-Request-Type: find-immihistory|find-passport|find-driverlicense)`);
  console.log(`[mock-upstream] requires headers: X-Access: ${API_KEY}   X-ReqType: ${REQ_TYPE} (/tra-cuu/* routes only, not /find)`);
});
