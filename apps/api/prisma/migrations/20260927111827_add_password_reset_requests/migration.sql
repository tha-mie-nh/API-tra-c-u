-- CreateEnum
CREATE TYPE "app"."PasswordResetRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "app"."password_reset_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "username_snapshot" VARCHAR(100) NOT NULL,
    "status" "app"."PasswordResetRequestStatus" NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_ip" INET,
    "resolved_at" TIMESTAMPTZ,
    "resolved_by" UUID,

    CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_reset_requests_status_requested_at_idx" ON "app"."password_reset_requests"("status", "requested_at" DESC);

-- CreateIndex
CREATE INDEX "password_reset_requests_user_id_idx" ON "app"."password_reset_requests"("user_id");

-- AddForeignKey
ALTER TABLE "app"."password_reset_requests" ADD CONSTRAINT "password_reset_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."password_reset_requests" ADD CONSTRAINT "password_reset_requests_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
