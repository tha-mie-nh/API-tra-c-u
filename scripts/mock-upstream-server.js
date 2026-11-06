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
// VEHICLE_OWNERSHIP/FAMILY_EVENTS/FACE_PHOTO/the 4 /find datasources so one
// CCCD ("001099001234") returns a result on every datasource in a live demo.
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
  { soGPKD: 'GP-2023-004455', tenDoanhNghiep: 'Công ty CP Thương mại XYZ', nganhNghe: 'Bán buôn thiết bị điện tử', ngayCap: '2023-09-22T00:00:00Z' },
];

// Candidate routes for the "thêm API hoàn toàn mới" live demo (Demo B/C in
// demo-guide.md) — NOT backing any datasource already in config.json. Each
// is a different domain on purpose (bảo hiểm xã hội/giao thông/giáo dục,
// nothing citizen-ID-adjacent) so picking a different one each demo session
// still proves the same point: config-driven, not hardcoded per domain.
// Same auth convention as MST/GPKD (X-Access + X-ReqType: LOOKUP, flat
// "data" array) — no real vendor sample for these, so no reason to invent
// a different shape than the one already taught via MST/GPKD.
const BHXH_RECORDS = [
  { cccd: '001099001234', hoTen: 'Nguyễn Văn A', soBHXH: '0199009999', donViCongTac: 'Công ty TNHH Công nghệ ABC', mucLuongDong: 15000000, soThangDong: 48, trangThai: 'Đang đóng' },
  { cccd: '001099005678', hoTen: 'Trần Thị B', soBHXH: '0199008888', donViCongTac: 'Công ty CP Thương mại XYZ', mucLuongDong: 12000000, soThangDong: 30, trangThai: 'Đang đóng' },
];
const TRAFFIC_VIOLATION_RECORDS = [
  { bienSoXe: '30A-123.45', hoTenChuXe: 'Nguyễn Văn A', loaiViPham: 'Vượt đèn đỏ', diaDiem: 'Ngã tư Láng Hạ - Thái Hà', thoiGianViPham: '2026-01-10T08:15:00Z', mucPhat: 4000000, trangThaiNop: 'Chưa nộp' },
  { bienSoXe: '29B-567.89', hoTenChuXe: 'Trần Thị B', loaiViPham: 'Quá tốc độ', diaDiem: 'QL1A, Thanh Trì', thoiGianViPham: '2026-02-05T14:40:00Z', mucPhat: 2500000, trangThaiNop: 'Đã nộp' },
];
const DIPLOMA_RECORDS = [
  { soHieuVanBang: 'DH2021001234', hoTen: 'Nguyễn Văn A', cccd: '001099001234', truong: 'Đại học Bách Khoa Hà Nội', nganh: 'Công nghệ thông tin', xepLoai: 'Giỏi', ngayCap: '2021-07-15T00:00:00Z' },
  { soHieuVanBang: 'CD2019005678', hoTen: 'Trần Thị B', cccd: '001099005678', truong: 'Cao đẳng Kinh tế Kỹ thuật', nganh: 'Kế toán', xepLoai: 'Khá', ngayCap: '2019-06-20T00:00:00Z' },
];

// 1x1 transparent PNG, as a FULL data URI — real upstream for this vendor
// always sends "data:image/png;base64,..." already prefixed (confirmed
// against a real sample), never bare base64. `Base64ImageCell` on the FE
// already handles both (adds the prefix only if missing), but the mock
// mirrors the real shape here so the demo exercises the real path.
const DEMO_PHOTO_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUAAarVyFEAAAAASUVORK5CYII=';

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
  'find_immihistory': [
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
      hoTen: 'NGUYEN VAN AN',
      ngaySinh: '31/12/1999',
      gioiTinh: 'M',
      noiSinh: 'HN',
      danToc: 'Kinh',
      soGiayToDangKy: '001099001234',
      noiCapGiayTo: 'C06',
      ngayCapGiayTo: '19/09/2019',
      soDienThoai: '0900123456',
      ngheNghiep: 'Chuyen vien',
      noiLamViec: 'Cau Giay, HN',
      chucVu: null,
      diaChiThuongTru: '',
      diaChiTamTru: null,
      soHoChieu: 'E00123456',
      ngayCapHoChieu: '20/10/2020',
      hanHoChieu: '20/10/2030',
      noiCapHoChieu: 'AA',
      trangThai: '1',
      ngayHuy: null,
    },
  ],
  'find-driverlicense': [
    {
      soCCCD: '001099001234',
      soGplx: '010123456789',
      ngaySinh: '12/05/1999',
      hangGPLX: 'B2',
      ngayCap: '01/03/2020',
      hinhAnh: DEMO_PHOTO_DATA_URI,
    },
  ],
};

// find-face uses the SAME /find endpoint but a FLATTER envelope than the
// other 3 (confirmed against a real customer sample: {"data":[...],
// "errorDescription":"","status":"200"} — no "code"/"message", no extra
// "data.0.data" nesting, and "status" is a STRING here, not a number).
// recordsPath: "data" for FACE_PHOTO in config.json reflects that.
const FIND_FACE_RECORDS = [{ soCCCD: '001099001234', hinhAnh: DEMO_PHOTO_DATA_URI, created_at: '20/10/2024 12:30:45' }];

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
  { so_cccd: '001099001234', ho_ten: 'Nguyễn Văn A', chieu: 'NHAP', cua_khau: 'Sân bay Nội Bài', quoc_gia: 'Nhật Bản', muc_dich: 'Du lịch', thoi_diem: '2026-01-22T18:05:00Z' },
];
const CCCD_HISTORY_RECORDS = [
  { so_cccd: '001099001234', ho_ten: 'Nguyễn Văn A', loai_giay_to: 'CMND9', so_giay_to: '025099001234', tuoi_luc_cap: 18, chieu_cao: 168, dac_diem_nhan_dang: 'Không có', noi_cap: 'Công an TP Hà Nội', ngay_cap: '2017-05-12T00:00:00Z' },
  { so_cccd: '001099001234', ho_ten: 'Nguyễn Văn A', loai_giay_to: 'CCCD_CHIP', so_giay_to: '001099001234', tuoi_luc_cap: 25, chieu_cao: 170, dac_diem_nhan_dang: 'Không có', noi_cap: 'Cục Cảnh sát QLHC về TTXH', ngay_cap: '2024-03-10T00:00:00Z' },
];
const VEHICLE_OWNERSHIP_RECORDS = [
  { so_cccd: '001099001234', chu_so_huu: 'Nguyễn Văn A', loai_xe: 'XE_MAY', hang_xe: 'Honda', dong_xe: 'Vision', bien_so: '29H1-234.56', gia_tri: 35000000, noi_dang_ky: 'Phòng CSGT Hà Nội', ngay_dang_ky: '2019-02-14T00:00:00Z' },
  { so_cccd: '001099001234', chu_so_huu: 'Nguyễn Văn A', loai_xe: 'O_TO', hang_xe: 'Toyota', dong_xe: 'Vios', bien_so: '30A-123.45', gia_tri: 550000000, noi_dang_ky: 'Phòng CSGT Hà Nội', ngay_dang_ky: '2023-07-20T00:00:00Z' },
];
const FAMILY_EVENTS_RECORDS = [
  { so_cccd: '001099001234', ho_ten: 'Nguyễn Văn A', loai_su_kien: 'KHAI_SINH', quan_he: 'Bản thân', nguoi_lien_quan: '', cccd_nguoi_lien_quan: '', noi_dang_ky: 'UBND phường Láng Hạ', ngay_su_kien: '1999-05-12T00:00:00Z' },
  { so_cccd: '001099001234', ho_ten: 'Nguyễn Văn A', loai_su_kien: 'KET_HON', quan_he: 'Vợ/chồng', nguoi_lien_quan: 'Trần Thị B', cccd_nguoi_lien_quan: '001099005678', noi_dang_ky: 'UBND phường Láng Hạ', ngay_su_kien: '2022-11-01T00:00:00Z' },
];
// path, records, idField, header name for each /tra-cuu/* route below —
// FACE_PHOTO moved to the /find group (see FIND_FACE_RECORDS above, real
// sample confirmed it's /find + X-Request-Type: find-face, not a dedicated
// route). The citizen/CCCD ones below are a separate no-real-sample-yet
// vendor (X-Access, not X-Access-Key).
const SIMPLE_ROUTES = [
  { path: '/tra-cuu/cong-dan-co-ban', records: CITIZEN_BASIC_RECORDS, idField: 'cccd', headerName: 'x-access' },
  { path: '/tra-cuu/cong-dan-mo-rong', records: CITIZEN_EXTENDED_RECORDS, idField: 'so_cccd', headerName: 'x-access' },
  { path: '/tra-cuu/cu-tru', records: CITIZEN_RESIDENCE_RECORDS, idField: 'citizen_id', headerName: 'x-access' },
  { path: '/tra-cuu/xuat-nhap-canh', records: XUAT_NHAP_CANH_RECORDS, idField: 'so_cccd', headerName: 'x-access' },
  { path: '/tra-cuu/lich-su-cccd', records: CCCD_HISTORY_RECORDS, idField: 'so_cccd', headerName: 'x-access' },
  { path: '/tra-cuu/phuong-tien', records: VEHICLE_OWNERSHIP_RECORDS, idField: 'so_cccd', headerName: 'x-access' },
  { path: '/tra-cuu/ho-tich', records: FAMILY_EVENTS_RECORDS, idField: 'so_cccd', headerName: 'x-access' },
  // "Thêm API mới" demo candidates (see comment above BHXH_RECORDS) — not
  // wired to any datasource in config.json; add one of these live in the
  // Admin UI to demo, same as MST_LOOKUP/GPKD_LOOKUP.
  { path: '/tra-cuu/bao-hiem-xa-hoi', records: BHXH_RECORDS, idField: 'cccd', headerName: 'x-access' },
  { path: '/tra-cuu/vi-pham-giao-thong', records: TRAFFIC_VIOLATION_RECORDS, idField: 'bienSoXe', headerName: 'x-access' },
  { path: '/tra-cuu/van-bang', records: DIPLOMA_RECORDS, idField: 'soHieuVanBang', headerName: 'x-access' },
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

  // Shared /find endpoint for all 4 real-spec datasources — X-Access-Key
  // only (X-Request-Type picks the dataset, not a fixed value like X-ReqType
  // above). find-face uses a FLATTER envelope than the other 3 — confirmed
  // against real samples, this vendor is not internally consistent across
  // its own request types, so don't assume one shape for the whole group.
  if (url.pathname === '/find' && req.method === 'POST') {
    if (!checkAuth(req, res, { headerName: 'x-access-key' })) return;
    const reqType = req.headers['x-request-type'];

    if (reqType === 'find-face') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: FIND_FACE_RECORDS, errorDescription: '', status: '200' }));
      return;
    }

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
  console.log(`[mock-upstream] POST /find  (X-Request-Type: find_immihistory|find-passport|find-driverlicense|find-face)`);
  console.log(`[mock-upstream] headers — /tra-cuu/* (except anh-mat, now under /find): X-Access: ${API_KEY}, X-ReqType: ${REQ_TYPE}`);
  console.log(`[mock-upstream] headers — /find: X-Access-Key: ${API_KEY}`);
});
