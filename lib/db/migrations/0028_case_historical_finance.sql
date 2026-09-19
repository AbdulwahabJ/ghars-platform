CREATE TABLE IF NOT EXISTS "case_historical_finance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "case_id" uuid NOT NULL,
  "import_batch_id" uuid,
  "raw_source_text" text NOT NULL,
  "historical_total_amount" numeric(12,2),
  "historical_paid_amount" numeric(12,2),
  "opening_remaining_balance" numeric(12,2),
  "historical_payment_status" text,
  "is_verified" boolean NOT NULL DEFAULT false,
  "verified_by" uuid,
  "verified_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "case_historical_finance"
    ADD CONSTRAINT "FK_case_historical_finance_tenant"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_historical_finance"
    ADD CONSTRAINT "FK_case_historical_finance_case"
    FOREIGN KEY ("case_id") REFERENCES "implant_cases"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_historical_finance"
    ADD CONSTRAINT "FK_case_historical_finance_batch"
    FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_historical_finance"
    ADD CONSTRAINT "FK_case_historical_finance_verified_by"
    FOREIGN KEY ("verified_by") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_historical_finance"
    ADD CONSTRAINT "CHK_case_historical_finance_amounts_non_negative"
    CHECK (
      ("historical_total_amount" IS NULL OR "historical_total_amount" >= 0)
      AND ("historical_paid_amount" IS NULL OR "historical_paid_amount" >= 0)
      AND ("opening_remaining_balance" IS NULL OR "opening_remaining_balance" >= 0)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "case_historical_finance"
    ADD CONSTRAINT "CHK_case_historical_finance_status"
    CHECK ("historical_payment_status" IS NULL OR "historical_payment_status" IN ('UNKNOWN','UNPAID','PARTIALLY_PAID','PAID_IN_FULL','REVIEW_REQUIRED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_case_historical_finance_tenant_case"
  ON "case_historical_finance" ("tenant_id","case_id");
CREATE INDEX IF NOT EXISTS "IDX_case_historical_finance_tenant"
  ON "case_historical_finance" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_case_historical_finance_batch"
  ON "case_historical_finance" ("import_batch_id");