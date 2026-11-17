-- CreateTable
CREATE TABLE "app"."query_log_payloads" (
    "query_log_id" UUID NOT NULL,
    "upstream_request" JSONB,
    "upstream_response" JSONB,
    "client_response" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_log_payloads_pkey" PRIMARY KEY ("query_log_id")
);

-- AddForeignKey
ALTER TABLE "app"."query_log_payloads" ADD CONSTRAINT "query_log_payloads_query_log_id_fkey" FOREIGN KEY ("query_log_id") REFERENCES "app"."query_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
