ALTER TABLE "import_batches"
  ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
ALTER TABLE "import_batches"
  ADD COLUMN IF NOT EXISTS "committed_row_numbers" jsonb NOT NULL DEFAULT '[]'::jsonb;