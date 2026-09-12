DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'landing_media_object_path_check'
      AND conrelid = 'landing_media'::regclass
  ) THEN
    ALTER TABLE "landing_media"
      ADD CONSTRAINT "landing_media_object_path_check"
      CHECK (
        "source_type" <> 'OBJECT'
        OR "file_ref" ~ '^/objects/landing-media/[0-9a-f-]{36}$'
      );
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_landing_media_object_file_ref"
  ON "landing_media" ("file_ref")
  WHERE "source_type" = 'OBJECT';