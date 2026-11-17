-- CreateIndex
-- Trang IP / lọc ip không kèm khoảng thời gian (đo 2M dòng: 170-210ms Seq Scan -> ~1-10ms).
CREATE INDEX "query_logs_ip_created_at_idx" ON "app"."query_logs"("ip", "created_at" DESC);

-- CreateIndex
-- Tra cứu theo upstream_request_id (đo 2M dòng: 190-360ms -> 0.2ms).
-- Bảng lớn ở prod: cân nhắc chạy tay CREATE INDEX CONCURRENTLY trước rồi `prisma migrate resolve`.
CREATE INDEX "query_logs_upstream_request_id_idx" ON "app"."query_logs"("upstream_request_id");
