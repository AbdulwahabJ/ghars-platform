CREATE TABLE IF NOT EXISTS "import_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "imported_by" uuid NOT NULL REFERENCES "users"("id"),
  "source_filename" text NOT NULL,
  "source_mime" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ANALYZED',
  "source_rows" jsonb NOT NULL,
  "mappings" jsonb NOT NULL,
  "normalized_rows" jsonb NOT NULL,
  "created_records" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "committed_at" timestamptz,
  "rolled_back_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "IDX_import_batches_tenant_id" ON "import_batches" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_import_batches_imported_by" ON "import_batches" ("imported_by");
CREATE INDEX IF NOT EXISTS "IDX_import_batches_status" ON "import_batches" ("status");

CREATE TABLE IF NOT EXISTS "import_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "source_kind" text NOT NULL,
  "source_value" text NOT NULL,
  "destination" text NOT NULL,
  "confidence" numeric(4,3) NOT NULL DEFAULT 0.5,
  "approved_by" uuid REFERENCES "users"("id"),
  "approved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_import_mappings_tenant_source"
  ON "import_mappings" ("tenant_id", "source_kind", "source_value");