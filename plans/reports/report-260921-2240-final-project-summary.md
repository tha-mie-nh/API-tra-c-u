# Báo cáo tổng kết — APP tra cứu dữ liệu

Plan: `plans/260920-2200-app-tra-cuu-du-lieu/`. Toàn bộ 10 phase (9 gốc + 1 bổ sung) đã hoàn thành, build/test pass, verify qua browser + Docker prod thật.

## Trạng thái các phase

| # | Phase | Trạng thái |
|---|---|---|
| 01 | Monorepo + infra scaffold | completed |
| 02 | Database schema + migrations + seed | completed |
| 03 | Auth, RBAC & admin user/role backend | completed |
| 04 | Config-driven datasource engine + mock APIs | completed |
| 05 | Query, history & image-serving endpoints | completed |
| 06 | Frontend foundation + auth flow | completed |
| 07 | Dynamic query UI + timeline views | completed |
| 08 | Admin & history UI | completed |
| 09 | Hardening, Docker packaging & deploy | completed |
| 10 | Demo timeline features (4 datasource mới: xuất nhập cảnh, lịch sử CCCD, sở hữu phương tiện, sự kiện hộ tịch) | completed |

Kiến trúc cốt lõi (config-driven datasource engine) đã verify nhiều lần: thêm datasource mới = sửa `config/config.json` + restart container (không rebuild image, không sửa code Frontend/Backend core) — kể cả khi 2 agent chạy song song sửa cùng lúc (Phase 09 + Phase 10), invariant này vẫn giữ đúng.

Docker prod stack đã build + chạy thật qua Caddy (HTTPS, security headers, migrate-before-api), Trivy + ClamAV scan thật (0 lỗi nghiêm trọng), backup/restore Postgres đã test thật. Sau khi merge Phase 10, đã re-sync quyền `api:*` cho ADMIN trên DB prod qua API thật và verify `POST /query/FAMILY_EVENTS` trả 200 đúng — toàn bộ 8 datasource dùng được trên stack prod.

## Câu hỏi/quyết định còn treo — cần Egor xác nhận

**Chặn go-live nhất — 3 API thật + Image DB thật (toàn bộ hệ thống hiện chạy trên mock):**
1. Khi nào có doc 3 API thật? Input/output field chính xác, response envelope, field nào là timestamp cho timeline mỗi API.
2. "Bản ghi công dân với vài trường cơ bản" — cụ thể là trường nào?
3. 3 API tra thông tin khác nhau input/output ra sao (Egor nói "mỗi API 1 input/output khác nhau")?
4. API có tự phân trang không, hay Backend tự cắt?
5. Image DB thật (MinIO + Postgres): connection string, tên bảng/cột, có id ổn định cho từng ảnh không, 1 CCCD → nhiều ảnh?

**Chặn deploy thật:**
6. Host triển khai: VM công ty / on-prem / cloud? Docker thuần hay K8s?
7. Public DNS + cert path cho TLS thật, hay dùng CA nội bộ?
8. Scanner malware cụ thể công ty yêu cầu (đang dùng ClamAV, đã chạy thật — xác nhận chấp nhận được)?
9. Ai backup MinIO — team mình hay team data? (Postgres backup/restore đã xong+test, MinIO mới chỉ ghi chú)
10. Có sẵn Docker registry/CI công ty hay tự dựng?
11. Node 22 có chấp nhận được không (đang dùng)?
12. Image API hiện 856MB (do argon2/undici cần glibc base) — chấp nhận được không?

**Auth/RBAC:**
13. Chính sách mật khẩu (đề xuất: tối thiểu 12 ký tự, không bắt đổi định kỳ)?
14. Ngưỡng auto-lock (đề xuất: 5 lần / 15 phút)?
15. Có cần SSO/LDAP sau này không?
16. `history:view_own` mặc định cấp cho mọi user hay admin phải cấp tay?

**Dữ liệu:**
17. Retention policy cho `query_logs`/`audit_logs` — giữ vĩnh viễn hay purge sau N tháng?

**UI/UX:**
18. Branding (logo, màu, tên app chính thức)?
19. UI chỉ tiếng Việt hay cần cả tiếng Anh?
20. Có cần export CSV/in kết quả tra cứu không? (có ảnh hưởng quản trị dữ liệu, nên hỏi Egor)
21. Trung bình bao nhiêu ảnh/người (quyết định có cần virtualization/thumbnail)?
22. Có cần watermark/chặn tải ảnh không?
23. Admin có được xóa cứng user không, hay chỉ khóa/mở khóa (đang giả định chỉ khóa)?
24. Audit log có cần export CSV cho compliance không?

**Kỹ thuật (không chặn, note cho phase sau nếu cần):**
25. `ClientDatasource` type chưa có marker chính thức cho "field nào là record id của ảnh" — hiện dùng quy ước đặt tên `recordId`. Nếu datasource ảnh tương lai đặt tên khác sẽ âm thầm không hiện ảnh nào — cần bổ sung type nếu có datasource ảnh thứ 2.
26. Gỡ role ADMIN khỏi admin cuối cùng chỉ có cảnh báo UI, chưa có ràng buộc chặn cứng phía server.

## Checklist trước khi go-live thật

- [ ] Có doc 3 API thật + Image DB thật từ Egor
- [ ] Quyết định host deploy + TLS cert + CI/registry
- [ ] Quyết định ai backup MinIO (Postgres đã xong)
- [ ] Gán scope quyền cho MinIO service account (hiện dùng root credential — đã ghi trong `docs/security-checklist.md`)
- [ ] Trả lời các câu hỏi RBAC/password-policy/retention ở trên
- [ ] `.env.prod` hiện tại là **test-only** (password tạm) — phải thay trước khi deploy thật
- [ ] `git init` + tạo commit đầu tiên + push (repo hiện chưa có commit nào)

## Tài liệu liên quan
- `docs/deployment-guide.md`, `docs/security-checklist.md` — hướng dẫn deploy + checklist bảo mật.
- `scan-reports/` — kết quả Trivy + ClamAV thật.
- `plans/260920-2200-app-tra-cuu-du-lieu/` — toàn bộ phase file + reference doc (config schema, ERD, API spec, UX screens).