-- CreateTable
CREATE TABLE "app"."datasource_secrets" (
    "datasource_code" VARCHAR(100) NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "updated_by" VARCHAR(100),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "datasource_secrets_pkey" PRIMARY KEY ("datasource_code")
);
