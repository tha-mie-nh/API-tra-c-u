# Phase 07: CI, báo cáo, bảo trì

## Context Links
- [plan.md](plan.md); CI hiện có: `.github/workflows/ci.yml` (lint, typecheck, build, audit, `pnpm test`), `build-and-scan.yml` (build image, quét ClamAV/Trivy).

## Overview
- Ưu tiên: trung bình. Trạng thái: chưa làm. Mục tiêu: chạy các bộ test ở đúng thời điểm, có báo cáo đính kèm được, và có quy ước để bộ test không mục nát.

## Key Insights
- CI hiện chỉ chạy unit; e2e API (cần Postgres) và test trình duyệt chưa chạy ở đâu cả, nên lỗi tích hợp chỉ thấy khi người dùng báo.
- Hai lần phát hành gần đây ghi đè tag image: cần ghi digest và kết quả kiểm thử đi kèm từng digest để biết "bản nào đã qua test nào".

## Requirements
### Pipeline 3 tầng
| Tầng | Khi nào | Gồm | Thời gian mục tiêu |
|---|---|---|---|
| 1 | Mỗi push/PR | lint, typecheck, build, unit API + web, audit | dưới 6 phút |
| 2 | PR vào `main` | tầng 1 + e2e API (Postgres + `simple-api` + mock) + Playwright `@smoke` + bộ `@reg` trên stack build từ PR | dưới 25 phút |
| 3 | Hằng đêm và trước phát hành | tầng 2 + Playwright đầy đủ (3 trình duyệt) + tải + hỗn loạn + bảo mật + nâng cấp/quay lui + quét image | dưới 90 phút |

### Cổng phát hành
Không phát hành image nếu: bộ `@reg` không pass 100%, bất kỳ ca P1 nào không pass, có lỗ hổng mức cao chưa xử lý, hoặc độ phủ giảm quá ngưỡng.

### Báo cáo
- Mỗi lần chạy tầng 2/3 xuất báo cáo HTML (Playwright), tóm tắt Markdown (số ca theo ID, đạt/hỏng/bỏ qua, độ phủ, kết quả tải so ngưỡng), lưu thành artifact.
- File `docs/test-reports/<ngày>-<digest>.md`: kết quả kèm digest image đã kiểm thử và phiên bản `simple-api` đã dùng.
- Ma trận truy vết: ID ca (phase 05) -> test tự động -> kết quả lần chạy gần nhất.

### Bảo trì
- Quy ước đặt tên test chứa ID ca (`[REG-06] ...`, `[DS-09] ...`) để lọc và truy vết.
- Mỗi lỗi mới: thêm ca `REG-xx` hỏng trước khi sửa, pass sau khi sửa.
- Test chập chờn: tự động chạy lại một lần và ghi nhận; ca chập chờn 3 lần trong 2 tuần phải sửa hoặc cách ly có hạn.
- Rà soát danh mục ca mỗi quý và sau mỗi thay đổi lớn của DSL cấu hình.
- Tài liệu hướng dẫn chạy test cho người mới: `docs/testing-guide.md`.

## Architecture
Workflow GitHub Actions mới `e2e.yml` (tầng 2) và `nightly.yml` (tầng 3) gọi `scripts/e2e-up.sh`, chạy Jest e2e và Playwright trong compose, thu artifact, `e2e-down.sh` luôn chạy cuối. Cache trình duyệt Playwright và lớp Docker để rút ngắn thời gian.

## Related Code Files
Tạo: `.github/workflows/e2e.yml`, `.github/workflows/nightly.yml`, `scripts/test-report.js`, `docs/testing-guide.md`. Sửa: `ci.yml` (thêm ngưỡng độ phủ).

## Implementation Steps
1. Thêm tầng 2 sau khi phase 01-02 xong (e2e API trước, Playwright sau).
2. Thêm báo cáo và quy ước tên test.
3. Thêm tầng 3 khi phase 04-06 có đủ bộ.
4. Gắn cổng phát hành vào quy trình đẩy image (script phát hành kiểm tra có báo cáo pass cho digest).

## Todo List
- [ ] Workflow tầng 2 và tầng 3
- [ ] Báo cáo HTML + tóm tắt Markdown + truy vết ID
- [ ] Cổng phát hành theo digest
- [ ] Hướng dẫn chạy test cho người mới

## Success Criteria
- Một PR làm hỏng ca P1 bị chặn ở tầng 2 với báo cáo chỉ rõ ID ca và bằng chứng.
- Mỗi bản phát hành có file báo cáo gắn với digest.
- Người mới chạy được toàn bộ bộ test cục bộ bằng một lệnh theo tài liệu.

## Risks
- CI không hỗ trợ Docker-in-Docker hoặc quá chậm: chạy tầng 2/3 trên máy chạy riêng (runner tự lưu trữ) hoặc rút gọn tầng 2 còn e2e API + smoke.
- Chi phí chạy lâu: tầng 3 chỉ chạy đêm hoặc theo yêu cầu.

## Security Considerations
- Artifact báo cáo không chứa bí mật; khóa thử và mật khẩu seed chỉ tồn tại trong stack e2e; không dùng secret thật trong CI cho e2e.

## Next Steps
Sau khi duyệt kế hoạch: bắt đầu phase 01 và bộ `@reg`.
